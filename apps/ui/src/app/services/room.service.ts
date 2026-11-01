import { Injectable, computed, inject, signal } from '@angular/core';
import {
  roomCodeSchema,
  serverMessageSchema,
  type Aim,
  type ClientMessage,
  type GameState,
  type PlayerIndex,
  type PlayerName,
  type RoomCode,
  type Roster,
  type SeatToken,
  type ServerMessage,
  type Shot,
  type TableState,
  type TrapRequest,
  type Vec2,
} from '@dirtypool/contracts';
import { SHOT_CLOCK_MS, placeCueBallInHand } from '@dirtypool/game';
import { roomSocketUrl } from '../config/api.const';
import { ROOM_SOCKET_FACTORY, type RoomSocket } from '../types/room-socket.type';
import type { RemoteShot } from '../types/remote-shot.type';
import type { ShotAnnouncement } from '../types/shot-announcement.type';
import type { ShotClock } from '../types/shot-clock.type';
import { TIMER_SCHEDULER } from '../types/timer-scheduler.type';
import { ShotAnimator } from './shot-animator.service';

export type RoomConnection = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

// Aim updates go out at most this often; the last one always gets through.
const AIM_INTERVAL_MS = 50;
// Reconnect attempts back off from the first delay up to the cap, then give up at the limit.
const RECONNECT_FIRST_MS = 1000;
const RECONNECT_MAX_MS = 10_000;
const RECONNECT_GIVE_UP_MS = 110_000;
// Per tab, so two tabs in one browser can hold two different seats.
const SEAT_STORAGE_KEY = 'dirtypool.seat';

interface PendingEntry {
  resolve(code: RoomCode): void;
  reject(error: Error): void;
  // Sent instead when the first message is refused, e.g. a stale token falling back to a join.
  fallback: ClientMessage | null;
}

interface StoredSeat {
  readonly code: RoomCode;
  readonly token: SeatToken;
}

// One online room seen from this browser. The server owns the rules: every shot is animated
// locally with the shared simulation, then the broadcast state is adopted. A dropped socket
// reconnects on its own and takes the same seat back with its token.
@Injectable({ providedIn: 'root' })
export class RoomService {
  readonly connection = computed(() => this.connectionState());
  readonly code = computed(() => this.codeState());
  readonly playerIndex = computed(() => this.playerIndexState());
  readonly roster = computed(() => this.rosterState());
  readonly playerCount = computed(() => this.rosterState().filter((seat) => seat !== null).length);
  readonly opponentSeat = computed(() => {
    const me = this.playerIndexState();

    return me === null ? null : this.rosterState()[me === 0 ? 1 : 0];
  });
  readonly opponentName = computed(() => this.opponentSeat()?.name ?? null);
  // Stays set after the opponent leaves, so the room can say who left.
  readonly lastOpponentName = computed(() => this.lastOpponentNameState());
  readonly game = computed(() => this.gameState());
  readonly table = computed(() => this.tableState());
  readonly animating = computed(() => this.animatingState());
  readonly error = computed(() => this.errorState());
  readonly clock = computed(() => this.clockState());
  readonly opponentAim = computed(() => this.opponentAimState());
  // The opponent's latest shot, so the table can show their cue strike as the balls set off.
  readonly opponentShot = computed(() => this.opponentShotState());
  // The outcome of the most recent shot, numbered so the UI can replay an announcement.
  readonly lastShot = computed(() => this.lastShotState());
  readonly canShoot = computed(() => {
    const game = this.gameState();

    return (
      game !== null &&
      this.connectionState() === 'open' &&
      !this.animatingState() &&
      game.phase === 'aiming' &&
      this.playerCount() === 2 &&
      game.currentPlayer === this.playerIndexState()
    );
  });

  private readonly createSocket = inject(ROOM_SOCKET_FACTORY);
  private readonly animator = inject(ShotAnimator);
  private readonly timers = inject(TIMER_SCHEDULER);
  private readonly connectionState = signal<RoomConnection>('idle');
  private readonly codeState = signal<RoomCode | null>(null);
  private readonly playerIndexState = signal<PlayerIndex | null>(null);
  private readonly rosterState = signal<Roster>([null, null]);
  private readonly lastOpponentNameState = signal<string | null>(null);
  private readonly gameState = signal<GameState | null>(null);
  private readonly tableState = signal<TableState | null>(null);
  private readonly animatingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly clockState = signal<ShotClock | null>(null);
  private readonly opponentAimState = signal<Aim | null>(null);
  private readonly opponentShotState = signal<RemoteShot | null>(null);
  private readonly lastShotState = signal<ShotAnnouncement | null>(null);
  private socket: RoomSocket | null = null;
  private pendingEntry: PendingEntry | null = null;
  private cancelAnimation: (() => void) | null = null;
  private pendingAim: Aim | null = null;
  private aimTimer: (() => void) | null = null;
  private lastAimAt = Number.NEGATIVE_INFINITY;
  private seatToken: SeatToken | null = null;
  private reconnectTimer: (() => void) | null = null;
  private reconnectDelayMs = RECONNECT_FIRST_MS;
  private reconnectStartedAt: number | null = null;

  createRoom(name: PlayerName, isPrivate = false): Promise<RoomCode> {
    return this.enter({ type: 'create-room', name, private: isPrivate }, null);
  }

  // A seat remembered for this code is taken back first; a stale token falls back to joining.
  joinRoom(code: string, name: PlayerName): Promise<RoomCode> {
    const parsed = roomCodeSchema.safeParse(code.trim().toUpperCase());

    if (!parsed.success) {
      return Promise.reject(new Error('A room code is four letters'));
    }

    if (this.codeState() === parsed.data && this.connectionState() === 'open') {
      return Promise.resolve(parsed.data);
    }

    const stored = readStoredSeat();
    const join: ClientMessage = { type: 'join-room', code: parsed.data, name };

    return stored !== null && stored.code === parsed.data
      ? this.enter({ type: 'rejoin-room', code: parsed.data, token: stored.token }, join)
      : this.enter(join, null);
  }

  shoot(shot: Shot): void {
    if (this.canShoot()) {
      this.flushAim();
      this.send({ type: 'shoot', shot });
    }
  }

  // Throttled: sends now if the last update is old enough, otherwise keeps the latest for later.
  sendAim(aim: Aim): void {
    if (!this.canShoot()) {
      return;
    }

    const elapsed = performance.now() - this.lastAimAt;

    if (elapsed >= AIM_INTERVAL_MS) {
      this.pushAim(aim);
      return;
    }

    this.pendingAim = aim;
    this.aimTimer ??= this.timers.schedule(() => this.flushAim(), AIM_INTERVAL_MS - elapsed);
  }

  // Ball in hand: preview locally while dragging; the server confirms the final spot.
  moveCueBall(position: Vec2): void {
    const game = this.gameState();

    if (this.canShoot() && game !== null && game.ballInHand) {
      this.tableState.set(previewCueBall(game.table, position));
    }
  }

  placeCueBall(position: Vec2): void {
    const game = this.gameState();

    if (!this.canShoot() || game === null || !game.ballInHand) {
      return;
    }

    if (placeCueBallInHand(game, position) === null) {
      this.tableState.set(game.table);
      return;
    }

    this.send({ type: 'place-cue', position });
  }

  // The server checks the pouch and the spot; its broadcast puts the trap on both tables.
  placeTrap(request: TrapRequest): void {
    if (this.canShoot()) {
      this.send({ type: 'place-trap', ...request });
    }
  }

  restart(): void {
    const game = this.gameState();

    if (game !== null && game.phase === 'finished') {
      this.send({ type: 'restart' });
    }
  }

  // Gives the seat up for good, so nobody waits for a reconnect that is not coming.
  leave(): void {
    this.stopReconnecting();

    if (this.connectionState() === 'open') {
      this.send({ type: 'leave-room' });
    }

    const socket = this.socket;

    this.socket = null;
    socket?.close();
    this.resetRoom();
    this.connectionState.set('idle');
  }

  private enter(message: ClientMessage, fallback: ClientMessage | null): Promise<RoomCode> {
    this.stopReconnecting();
    this.errorState.set(null);
    this.pendingEntry?.reject(new Error('Superseded by another room'));

    return new Promise<RoomCode>((resolve, reject) => {
      this.pendingEntry = { resolve, reject, fallback };
      this.connect(() => this.send(message));
    });
  }

  // Runs `onOpen` right away on an open socket, otherwise once a fresh socket connects.
  private connect(onOpen: () => void): void {
    if (this.socket !== null && this.connectionState() === 'open') {
      onOpen();
      return;
    }

    const previous = this.socket;

    this.socket = null;
    previous?.close();

    if (this.connectionState() !== 'reconnecting') {
      this.resetRoom();
      this.connectionState.set('connecting');
    }

    const socket = this.createSocket(roomSocketUrl());

    this.socket = socket;
    socket.onopen = () => {
      this.connectionState.set('open');
      onOpen();
    };
    socket.onmessage = (event) => this.receive(String(event.data));
    socket.onerror = () => undefined;
    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;
      this.onSocketLost();
    };
  }

  // Keep the room on screen and try to get the seat back; only give up after a while.
  private onSocketLost(): void {
    const inRoom = this.codeState() !== null && this.seatToken !== null;

    if (!inRoom) {
      this.resetRoom();
      this.connectionState.set('closed');
      this.failEntry('Could not reach the game server');
      return;
    }

    this.reconnectStartedAt ??= performance.now();

    if (performance.now() - this.reconnectStartedAt > RECONNECT_GIVE_UP_MS) {
      this.stopReconnecting();
      this.resetRoom();
      this.connectionState.set('closed');
      this.errorState.set('Connection lost');
      this.failEntry('Connection lost');
      return;
    }

    this.connectionState.set('reconnecting');
    this.clockState.set(null);
    this.opponentAimState.set(null);
    this.reconnectTimer = this.timers.schedule(() => this.tryReconnect(), this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(RECONNECT_MAX_MS, this.reconnectDelayMs * 2);
  }

  private tryReconnect(): void {
    const code = this.codeState();
    const token = this.seatToken;

    this.reconnectTimer = null;

    if (code === null || token === null) {
      return;
    }

    this.connect(() => this.send({ type: 'rejoin-room', code, token }));
  }

  private stopReconnecting(): void {
    this.reconnectTimer?.();
    this.reconnectTimer = null;
    this.reconnectDelayMs = RECONNECT_FIRST_MS;
    this.reconnectStartedAt = null;
  }

  private failEntry(message: string): void {
    this.pendingEntry?.reject(new Error(message));
    this.pendingEntry = null;
  }

  private send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  private receive(raw: string): void {
    let json: unknown;

    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }

    const parsed = serverMessageSchema.safeParse(json);

    if (parsed.success) {
      this.handle(parsed.data);
    }
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'room-joined':
        this.stopReconnecting();
        this.codeState.set(message.code);
        this.playerIndexState.set(message.playerIndex);
        this.seatToken = message.token;
        storeSeat({ code: message.code, token: message.token });
        this.rosterState.set(message.roster);
        this.rememberOpponent();
        this.adopt(message.game);
        this.setClock(message.clock);
        this.pendingEntry?.resolve(message.code);
        this.pendingEntry = null;
        return;
      case 'roster':
        this.rosterState.set(message.roster);
        this.rememberOpponent();
        this.setClock(message.clock);

        // Who breaks is settled when the second seat fills; mid-shot the animation's result wins.
        if (!this.animatingState()) {
          this.gameState.set(message.game);
          this.tableState.set(message.game.table);
        }
        return;
      case 'shot-played':
        if (message.playerIndex !== this.playerIndexState()) {
          const previous = this.opponentShotState();

          this.opponentShotState.set({ seq: (previous?.seq ?? 0) + 1, shot: message.shot });
        }

        this.animate(message.shot, message.game, message.clock);
        return;
      case 'turn-passed':
        this.cancelAnimation?.();
        this.cancelAnimation = null;
        this.adopt(message.game);
        this.setClock(message.clock);
        return;
      case 'opponent-aim':
        // A late update after the shot would pin a cue to the rolling cue ball.
        if (!this.animatingState()) {
          this.opponentAimState.set(message.aim);
        }
        return;
      case 'cue-placed': {
        const game = this.gameState();

        if (game !== null && !this.animatingState()) {
          const table = previewCueBall(game.table, message.position);

          this.gameState.set({ ...game, table });
          this.tableState.set(table);
        }
        return;
      }
      case 'trap-placed':
        if (!this.animatingState()) {
          this.gameState.set(message.game);
          this.tableState.set(message.game.table);
        }
        return;
      case 'game-reset':
        this.cancelAnimation?.();
        this.cancelAnimation = null;
        this.adopt(message.game);
        this.lastShotState.set(null);
        this.setClock(message.clock);
        return;
      case 'error':
        this.handleError(message.message);
        return;
    }
  }

  private handleError(message: string): void {
    const pending = this.pendingEntry;
    const game = this.gameState();

    if (pending?.fallback) {
      const fallback = pending.fallback;

      this.pendingEntry = { ...pending, fallback: null };
      clearStoredSeat();
      this.send(fallback);
      return;
    }

    this.errorState.set(message);
    this.failEntry(message);

    // A refused placement leaves the preview where the server does not have it.
    if (game !== null && !this.animatingState()) {
      this.tableState.set(game.table);
    }
  }

  private flushAim(): void {
    this.aimTimer?.();
    this.aimTimer = null;

    if (this.pendingAim !== null) {
      this.pushAim(this.pendingAim);
    }
  }

  private pushAim(aim: Aim): void {
    this.pendingAim = null;
    this.lastAimAt = performance.now();
    this.send({ type: 'aim', aim });
  }

  // The clock already counts from when the shot was sent, so it is held back until the balls
  // stop here; showing it earlier would put it under the shooter instead of the next player.
  private animate(shot: Shot, result: GameState, clock: number | null): void {
    const table = this.tableState();
    const deadline = clock === null ? null : performance.now() + clock;

    this.cancelAnimation?.();

    if (table === null) {
      this.adopt(result);
      this.setClock(clock);
      return;
    }

    this.clockState.set(null);
    this.opponentAimState.set(null);
    this.animatingState.set(true);
    this.cancelAnimation = this.animator.play(table, shot, {
      onTable: (frame) => this.tableState.set(frame),
      onDone: () => {
        this.cancelAnimation = null;
        this.adopt(result);
        this.clockState.set(deadline === null ? null : { deadline, durationMs: SHOT_CLOCK_MS });
      },
    });
  }

  // The server sends milliseconds left; the display counts down from a local timestamp.
  private setClock(remainingMs: number | null): void {
    this.clockState.set(
      remainingMs === null
        ? null
        : { deadline: performance.now() + remainingMs, durationMs: SHOT_CLOCK_MS },
    );
  }

  private rememberOpponent(): void {
    const opponent = this.opponentName();

    if (opponent !== null) {
      this.lastOpponentNameState.set(opponent);
    }
  }

  private announce(game: GameState): void {
    if (game.lastOutcome !== null && game !== this.gameState()) {
      const previous = this.lastShotState();

      this.lastShotState.set({ seq: (previous?.seq ?? 0) + 1, outcome: game.lastOutcome });
    }
  }

  private adopt(game: GameState): void {
    this.opponentAimState.set(null);
    this.announce(game);
    this.gameState.set(game);
    this.tableState.set(game.table);
    this.animatingState.set(false);
  }

  private resetRoom(): void {
    this.cancelAnimation?.();
    this.cancelAnimation = null;
    this.codeState.set(null);
    this.playerIndexState.set(null);
    this.seatToken = null;
    clearStoredSeat();
    this.rosterState.set([null, null]);
    this.lastOpponentNameState.set(null);
    this.gameState.set(null);
    this.tableState.set(null);
    this.animatingState.set(false);
    this.clockState.set(null);
    this.opponentAimState.set(null);
    this.lastShotState.set(null);
    this.flushAim();
    this.pendingAim = null;
  }
}

function previewCueBall(table: TableState, position: Vec2): TableState {
  return {
    ...table,
    balls: table.balls.map((ball) => (ball.id === 0 ? { ...ball, position } : ball)),
  };
}

function readStoredSeat(): StoredSeat | null {
  try {
    const raw = sessionStorage.getItem(SEAT_STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'code' in parsed &&
      'token' in parsed &&
      typeof parsed.code === 'string' &&
      typeof parsed.token === 'string'
    ) {
      return { code: parsed.code, token: parsed.token };
    }
  } catch {
    // Blocked storage just means no seat to resume.
  }

  return null;
}

function storeSeat(seat: StoredSeat): void {
  try {
    sessionStorage.setItem(SEAT_STORAGE_KEY, JSON.stringify(seat));
  } catch {
    // Without storage a refresh starts over; play still works.
  }
}

function clearStoredSeat(): void {
  try {
    sessionStorage.removeItem(SEAT_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
