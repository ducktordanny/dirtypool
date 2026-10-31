import type {
  GameState,
  PlayerIndex,
  PlayerName,
  RoomCode,
  Roster,
  ServerMessage,
  Shot,
} from '@dirtypool/contracts';
import {
  SHOT_CLOCK_MS,
  createGame,
  forfeitTurn,
  placeBallInHand,
  resolveShot,
  simulateShot,
} from '@dirtypool/game';

export type SendMessage = (message: ServerMessage) => void;

export interface RoomPlayer {
  readonly index: PlayerIndex;
  readonly name: PlayerName;
  readonly send: SendMessage;
}

export interface Room {
  readonly code: RoomCode;
  readonly players: RoomPlayer[];
  game: GameState;
  // Epoch milliseconds by which the current player must shoot, or null when no clock runs.
  deadline: number | null;
  cancelClock: (() => void) | null;
}

export type JoinResult =
  | { readonly kind: 'joined'; readonly room: Room; readonly player: RoomPlayer }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'full' };

export type PlaceResult = 'placed' | 'not-your-turn' | 'no-ball-in-hand' | 'blocked';

export type ShootResult =
  | { readonly kind: 'played'; readonly game: GameState }
  | { readonly kind: 'not-your-turn' }
  | { readonly kind: 'finished' }
  | { readonly kind: 'waiting-for-opponent' };

// Timers are injected so tests can fire the shot clock by hand.
export interface RoomStoreOptions {
  readonly random?: () => number;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => () => void;
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// Rooms live in memory only: a room dies with the process, which is fine for two friends.
export class RoomStore {
  private readonly rooms = new Map<RoomCode, Room>();
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => () => void;

  constructor(options: RoomStoreOptions = {}) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.schedule =
      options.schedule ??
      ((callback, delayMs) => {
        const timer = setTimeout(callback, delayMs);

        // A pending shot clock must not keep the process alive on its own.
        timer.unref();

        return () => clearTimeout(timer);
      });
  }

  create(
    send: SendMessage,
    name: PlayerName,
  ): { readonly room: Room; readonly player: RoomPlayer } {
    const player: RoomPlayer = { index: 0, name, send };
    const room: Room = {
      code: this.uniqueCode(),
      players: [player],
      game: createGame(),
      deadline: null,
      cancelClock: null,
    };

    this.rooms.set(room.code, room);

    return { room, player };
  }

  join(code: RoomCode, send: SendMessage, name: PlayerName): JoinResult {
    const room = this.rooms.get(code);

    if (room === undefined) {
      return { kind: 'not-found' };
    }

    if (room.players.length >= 2) {
      return { kind: 'full' };
    }

    const taken = new Set(room.players.map((existing) => existing.index));
    const player: RoomPlayer = { index: taken.has(0) ? 1 : 0, name, send };

    room.players.push(player);
    this.armClock(room, 0);

    return { kind: 'joined', room, player };
  }

  leave(room: Room, player: RoomPlayer): void {
    const index = room.players.indexOf(player);

    if (index !== -1) {
      room.players.splice(index, 1);
    }

    this.stopClock(room);

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
    }
  }

  // The server is authoritative: it simulates the shot and the resulting state is broadcast.
  shoot(room: Room, player: RoomPlayer, shot: Shot): ShootResult {
    if (room.game.phase === 'finished') {
      return { kind: 'finished' };
    }

    if (room.players.length < 2) {
      return { kind: 'waiting-for-opponent' };
    }

    if (room.game.currentPlayer !== player.index) {
      return { kind: 'not-your-turn' };
    }

    const { table, events, durationSeconds } = simulateShot(room.game.table, shot);

    room.game = resolveShot(room.game, table, events);
    this.armClock(room, durationSeconds * 1000);

    return { kind: 'played', game: room.game };
  }

  // Ball in hand: only the player on turn, only after a foul, only onto a clear spot.
  placeCue(room: Room, player: RoomPlayer, position: Vec2): PlaceResult {
    if (room.game.phase !== 'aiming' || room.game.currentPlayer !== player.index) {
      return 'not-your-turn';
    }

    if (!room.game.ballInHand) {
      return 'no-ball-in-hand';
    }

    const table = placeBallInHand(room.game.table, position);

    if (table === null) {
      return 'blocked';
    }

    room.game = { ...room.game, table };

    return 'placed';
  }

  // Either player can rack again once the game is over; mid-game restarts are refused.
  restart(room: Room): boolean {
    if (room.game.phase !== 'finished') {
      return false;
    }

    room.game = createGame();
    this.armClock(room, 0);

    return true;
  }

  roster(room: Room): Roster {
    const seat = (index: PlayerIndex): PlayerName | null =>
      room.players.find((player) => player.index === index)?.name ?? null;

    return [seat(0), seat(1)];
  }

  // Milliseconds left on the shot clock, for messages going out right now.
  clock(room: Room): number | null {
    return room.deadline === null ? null : Math.max(0, room.deadline - this.now());
  }

  broadcast(room: Room, message: ServerMessage, except?: RoomPlayer): void {
    for (const player of room.players) {
      if (player !== except) {
        player.send(message);
      }
    }
  }

  // Starts the clock for the current player once the balls stop (`rollingMs` from now).
  private armClock(room: Room, rollingMs: number): void {
    this.stopClock(room);

    if (room.players.length < 2 || room.game.phase !== 'aiming') {
      return;
    }

    const delay = rollingMs + SHOT_CLOCK_MS;

    room.deadline = this.now() + delay;
    room.cancelClock = this.schedule(() => this.expireClock(room), delay);
  }

  private stopClock(room: Room): void {
    room.cancelClock?.();
    room.cancelClock = null;
    room.deadline = null;
  }

  private expireClock(room: Room): void {
    room.cancelClock = null;
    room.game = forfeitTurn(room.game);
    this.armClock(room, 0);
    this.broadcast(room, { type: 'turn-passed', game: room.game, clock: this.clock(room) });
  }

  private uniqueCode(): RoomCode {
    let code: string;

    do {
      code = Array.from(
        { length: 4 },
        () => CODE_LETTERS[Math.floor(this.random() * CODE_LETTERS.length)] ?? 'A',
      ).join('');
    } while (this.rooms.has(code));

    return code;
  }
}
