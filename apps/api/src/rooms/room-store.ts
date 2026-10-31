import type { GameState, PlayerIndex, RoomCode, ServerMessage, Shot } from '@dirtypool/contracts';
import { createGame, resolveShot, simulateShot } from '@dirtypool/game';

export type SendMessage = (message: ServerMessage) => void;

export interface RoomPlayer {
  readonly index: PlayerIndex;
  readonly send: SendMessage;
}

export interface Room {
  readonly code: RoomCode;
  readonly players: RoomPlayer[];
  game: GameState;
}

export type JoinResult =
  | { readonly kind: 'joined'; readonly room: Room; readonly player: RoomPlayer }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'full' };

export type ShootResult =
  | { readonly kind: 'played'; readonly game: GameState }
  | { readonly kind: 'not-your-turn' }
  | { readonly kind: 'finished' }
  | { readonly kind: 'waiting-for-opponent' };

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// Rooms live in memory only: a room dies with the process, which is fine for two friends.
export class RoomStore {
  private readonly rooms = new Map<RoomCode, Room>();

  constructor(private readonly random: () => number = Math.random) {}

  create(send: SendMessage): { readonly room: Room; readonly player: RoomPlayer } {
    const player: RoomPlayer = { index: 0, send };
    const room: Room = { code: this.uniqueCode(), players: [player], game: createGame() };

    this.rooms.set(room.code, room);

    return { room, player };
  }

  join(code: RoomCode, send: SendMessage): JoinResult {
    const room = this.rooms.get(code);

    if (room === undefined) {
      return { kind: 'not-found' };
    }

    if (room.players.length >= 2) {
      return { kind: 'full' };
    }

    const taken = new Set(room.players.map((existing) => existing.index));
    const player: RoomPlayer = { index: taken.has(0) ? 1 : 0, send };

    room.players.push(player);

    return { kind: 'joined', room, player };
  }

  leave(room: Room, player: RoomPlayer): void {
    const index = room.players.indexOf(player);

    if (index !== -1) {
      room.players.splice(index, 1);
    }

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

    const { table, events } = simulateShot(room.game.table, shot);

    room.game = resolveShot(room.game, table, events);

    return { kind: 'played', game: room.game };
  }

  broadcast(room: Room, message: ServerMessage, except?: RoomPlayer): void {
    for (const player of room.players) {
      if (player !== except) {
        player.send(message);
      }
    }
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
