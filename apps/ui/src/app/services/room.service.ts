import { Injectable, computed, inject, signal } from '@angular/core';
import {
  roomCodeSchema,
  serverMessageSchema,
  type ClientMessage,
  type GameState,
  type PlayerIndex,
  type PlayerName,
  type RoomCode,
  type Roster,
  type ServerMessage,
  type Shot,
  type TableState,
} from '@dirtypool/contracts';
import { SHOT_CLOCK_MS } from '@dirtypool/game';
import { roomSocketUrl } from '../config/api.const';
import { ROOM_SOCKET_FACTORY, type RoomSocket } from '../types/room-socket.type';
import type { ShotClock } from '../types/shot-clock.type';
import { ShotAnimator } from './shot-animator.service';

export type RoomConnection = 'idle' | 'connecting' | 'open' | 'closed';

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
  readonly playerCount = computed(() => this.rosterState().filter((name) => name !== null).length);
  readonly game = computed(() => this.gameState());
  readonly table = computed(() => this.tableState());
  readonly animating = computed(() => this.animatingState());
  readonly error = computed(() => this.errorState());
  readonly clock = computed(() => this.clockState());
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
  private readonly connectionState = signal<RoomConnection>('idle');
  private readonly codeState = signal<RoomCode | null>(null);
  private readonly playerIndexState = signal<PlayerIndex | null>(null);
  private readonly rosterState = signal<Roster>([null, null]);
  private readonly gameState = signal<GameState | null>(null);
  private readonly tableState = signal<TableState | null>(null);
  private readonly animatingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly clockState = signal<ShotClock | null>(null);
  private socket: RoomSocket | null = null;
  private pendingEntry: PendingEntry | null = null;
  private cancelAnimation: (() => void) | null = null;

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
      this.send({ type: 'shoot', shot });
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
        this.adopt(message.game);
        this.setClock(message.clock);
        this.pendingEntry?.resolve(message.code);
        this.pendingEntry = null;
        return;
      case 'roster':
        this.rosterState.set(message.roster);
        this.setClock(message.clock);
        return;
      case 'shot-played':
        this.setClock(message.clock);
        this.animate(message.shot, message.game);
        return;
      case 'turn-passed':
        this.cancelAnimation?.();
        this.cancelAnimation = null;
        this.adopt(message.game);
        this.setClock(message.clock);
        return;
      case 'error':
        this.errorState.set(message.message);
        this.failEntry(message.message);
        return;
    }
  }

  private animate(shot: Shot, result: GameState): void {
    const table = this.tableState();

    this.cancelAnimation?.();

    if (table === null) {
      this.adopt(result);
      return;
    }

    this.animatingState.set(true);
    this.cancelAnimation = this.animator.play(table, shot, {
      onTable: (frame) => this.tableState.set(frame),
      onDone: () => {
        this.cancelAnimation = null;
        this.adopt(result);
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

  private adopt(game: GameState): void {
    this.gameState.set(game);
    this.tableState.set(game.table);
    this.animatingState.set(false);
  }

  private resetRoom(): void {
    this.cancelAnimation?.();
    this.cancelAnimation = null;
    this.codeState.set(null);
    this.playerIndexState.set(null);
    this.rosterState.set([null, null]);
    this.gameState.set(null);
    this.tableState.set(null);
    this.animatingState.set(false);
    this.clockState.set(null);
  }
}
