import { Injectable, computed, inject, signal } from '@angular/core';
import type { GameState, Shot, TableState } from '@dirtypool/contracts';
import {
  FIXED_STEP,
  createGame,
  isAtRest,
  resolveShot,
  startShot,
  stepTable,
  type TableEvent,
} from '@dirtypool/game';
import { FRAME_SCHEDULER } from '../types/frame-scheduler.type';

const MAX_FRAME_SECONDS = 0.1;

// Owns the local game and animates shots with the same fixed-step simulation the server uses.
@Injectable({ providedIn: 'root' })
export class GameService {
  readonly game = computed(() => this.gameState());
  readonly table = computed(() => this.tableState());
  readonly animating = computed(() => this.animatingState());
  readonly canShoot = computed(() => !this.animatingState() && this.gameState().phase === 'aiming');

  private readonly frames = inject(FRAME_SCHEDULER);
  private readonly gameState = signal<GameState>(createGame());
  private readonly tableState = signal<TableState>(this.gameState().table);
  private readonly animatingState = signal(false);
  private events: TableEvent[] = [];
  private accumulator = 0;
  private lastTimestamp: number | null = null;

  newGame(): void {
    const game = createGame();

    this.animatingState.set(false);
    this.gameState.set(game);
    this.tableState.set(game.table);
  }

  shoot(shot: Shot): void {
    if (!this.canShoot()) {
      return;
    }

    this.events = [];
    this.accumulator = 0;
    this.lastTimestamp = null;
    this.tableState.set(startShot(this.tableState(), shot));
    this.animatingState.set(true);
    this.frames.request((timestamp) => this.frame(timestamp));
  }

  private frame(timestamp: number): void {
    if (!this.animatingState()) {
      return;
    }

    const elapsed =
      this.lastTimestamp === null
        ? FIXED_STEP
        : Math.min(MAX_FRAME_SECONDS, (timestamp - this.lastTimestamp) / 1000);

    this.lastTimestamp = timestamp;
    this.accumulator += elapsed;

    let table = this.tableState();

    while (this.accumulator >= FIXED_STEP && !isAtRest(table)) {
      const result = stepTable(table);

      table = result.table;
      this.events.push(...result.events);
      this.accumulator -= FIXED_STEP;
    }

    this.tableState.set(table);

    if (isAtRest(table)) {
      this.finishShot(table);
      return;
    }

    this.frames.request((next) => this.frame(next));
  }

  private finishShot(table: TableState): void {
    const game = resolveShot(this.gameState(), table, this.events);

    this.gameState.set(game);
    this.tableState.set(game.table);
    this.animatingState.set(false);
  }
}
