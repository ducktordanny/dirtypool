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
  type ServerMessage,
  type Shot,
  type TableState,
  type Vec2,
} from '@dirtypool/contracts';
import { SHOT_CLOCK_MS, placeBallInHand } from '@dirtypool/game';
import { roomSocketUrl } from '../config/api.const';
import { ROOM_SOCKET_FACTORY, type RoomSocket } from '../types/room-socket.type';
import type { ShotAnnouncement } from '../types/shot-announcement.type';
import type { ShotClock } from '../types/shot-clock.type';
import { TIMER_SCHEDULER } from '../types/timer-scheduler.type';
import { ShotAnimator } from './shot-animator.service';

export type RoomConnection = 'idle' | 'connecting' | 'open' | 'closed';

// Aim updates go out at most this often; the last one always gets through.
const AIM_INTERVAL_MS = 50;

interface PendingEntry {
  resolve(code: RoomCode): void;
  reject(error: Error): void;
}

// One online room seen from this browser. The server owns the rules: every shot is animated
// locally with the shared simulation, then the broadcast state is adopted.
@Injectable({ providedIn: 'root' })
export class RoomService {
  readonly connection = computed(() => this.connectionState());
  readonly code = computed(() => this.codeState());
  readonly playerIndex = computed(() => this.playerIndexState());
  readonly roster = computed(() => this.rosterState());
  readonly opponentName = computed(() => {
    const me = this.playerIndexState();

    return me === null ? null : this.rosterState()[me === 0 ? 1 : 0];
  });
  // Stays set after the opponent leaves, so the room can say who left.
  readonly lastOpponentName = computed(() => this.lastOpponentNameState());
  readonly playerCount = computed(() => this.rosterState().filter((name) => name !== null).length);
  readonly game = computed(() => this.gameState());
  readonly table = computed(() => this.tableState());
  readonly animating = computed(() => this.animatingState());
  readonly error = computed(() => this.errorState());
  readonly clock = computed(() => this.clockState());
  readonly opponentAim = computed(() => this.opponentAimState());
  // The outcome of the most recent shot, numbered so the UI can replay an announcement.
  readonly lastShot = computed(() => this.lastShotState());
  readonly canShoot = computed(() => {
    const game = this.gameState();

    return (
      game !== null &&
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
  private readonly lastShotState = signal<ShotAnnouncement | null>(null);
  private socket: RoomSocket | null = null;
  private pendingEntry: PendingEntry | null = null;
  private cancelAnimation: (() => void) | null = null;
  private pendingAim: Aim | null = null;
  private aimTimer: (() => void) | null = null;
  private lastAimAt = Number.NEGATIVE_INFINITY;

  createRoom(name: PlayerName): Promise<RoomCode> {
    return this.enter({ type: 'create-room', name });
  }

  joinRoom(code: string, name: PlayerName): Promise<RoomCode> {
    const parsed = roomCodeSchema.safeParse(code.trim().toUpperCase());

    if (!parsed.success) {
      return Promise.reject(new Error('A room code is four letters'));
    }

    if (this.codeState() === parsed.data && this.connectionState() === 'open') {
      return Promise.resolve(parsed.data);
    }

    return this.enter({ type: 'join-room', code: parsed.data, name });
  }

  shoot(shot: Shot): void {
    if (this.canShoot()) {
      this.flushAim();
      this.send({ type: 'shoot', shot });
    }
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

    if (placeBallInHand(game.table, position) === null) {
      this.tableState.set(game.table);
      return;
    }

    this.send({ type: 'place-cue', position });
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

  restart(): void {
    const game = this.gameState();

    if (game !== null && game.phase === 'finished') {
      this.send({ type: 'restart' });
    }
  }

  leave(): void {
    this.socket?.close();
    this.socket = null;
    this.resetRoom();
    this.connectionState.set('idle');
  }

  private enter(message: ClientMessage): Promise<RoomCode> {
    this.errorState.set(null);
    this.pendingEntry?.reject(new Error('Superseded by another room'));

    return new Promise<RoomCode>((resolve, reject) => {
      this.pendingEntry = { resolve, reject };
      this.connect(() => this.send(message));
    });
  }

  // Runs `onOpen` right away on an open socket, otherwise once a fresh socket connects.
  private connect(onOpen: () => void): void {
    if (this.socket !== null && this.connectionState() === 'open') {
      onOpen();
      return;
    }

    this.socket?.close();
    this.resetRoom();
    this.connectionState.set('connecting');

    const socket = this.createSocket(roomSocketUrl());

    this.socket = socket;
    socket.onopen = () => {
      this.connectionState.set('open');
      onOpen();
    };
    socket.onmessage = (event) => this.receive(String(event.data));
    socket.onerror = () => this.failEntry('Could not reach the game server');
    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }

      const wasInRoom = this.codeState() !== null;

      this.socket = null;
      this.resetRoom();
      this.connectionState.set('closed');
      this.errorState.set(wasInRoom ? 'Connection lost' : null);
      this.failEntry('Could not reach the game server');
    };
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
        this.codeState.set(message.code);
        this.playerIndexState.set(message.playerIndex);
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
        return;
      case 'shot-played':
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
      case 'game-reset':
        this.cancelAnimation?.();
        this.cancelAnimation = null;
        this.adopt(message.game);
        this.lastShotState.set(null);
        this.setClock(message.clock);
        return;
      case 'error': {
        const game = this.gameState();

        this.errorState.set(message.message);
        this.failEntry(message.message);

        // A refused placement leaves the preview where the server does not have it.
        if (game !== null && !this.animatingState()) {
          this.tableState.set(game.table);
        }
        return;
      }
    }
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

  private adopt(game: GameState): void {
    this.opponentAimState.set(null);
    this.announce(game);
    this.gameState.set(game);
    this.tableState.set(game.table);
    this.animatingState.set(false);
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

  private resetRoom(): void {
    this.cancelAnimation?.();
    this.cancelAnimation = null;
    this.codeState.set(null);
    this.playerIndexState.set(null);
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
    balls: table.balls.map((ball) => (ball.id === 0 ? { ...ball, position } : ball)),
  };
}
