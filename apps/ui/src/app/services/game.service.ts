import { Injectable, computed, inject, signal } from '@angular/core';
import type { GameState, Shot, TableState } from '@dirtypool/contracts';
import {
  SHOT_CLOCK_MS,
  createGame,
  forfeitTurn,
  resolveShot,
  type TableEvent,
} from '@dirtypool/game';
import type { ShotClock } from '../types/shot-clock.type';
import { TIMER_SCHEDULER } from '../types/timer-scheduler.type';
import { ShotAnimator } from './shot-animator.service';

// Owns the local hotseat game: both players share one screen and the rules run in the browser.
@Injectable({ providedIn: 'root' })
export class GameService {
  readonly game = computed(() => this.gameState());
  readonly table = computed(() => this.tableState());
  readonly animating = computed(() => this.animatingState());
  readonly clock = computed(() => this.clockState());
  readonly canShoot = computed(() => !this.animatingState() && this.gameState().phase === 'aiming');

  private readonly animator = inject(ShotAnimator);
  private readonly timers = inject(TIMER_SCHEDULER);
  private readonly gameState = signal<GameState>(createGame());
  private readonly tableState = signal<TableState>(this.gameState().table);
  private readonly animatingState = signal(false);
  private readonly clockState = signal<ShotClock | null>(null);
  private cancelAnimation: (() => void) | null = null;
  private cancelClock: (() => void) | null = null;

  constructor() {
    this.startClock();
  }

  newGame(): void {
    const game = createGame();

    this.cancelAnimation?.();
    this.cancelAnimation = null;
    this.animatingState.set(false);
    this.gameState.set(game);
    this.tableState.set(game.table);
    this.startClock();
  }

  shoot(shot: Shot): void {
    if (!this.canShoot()) {
      return;
    }

    this.stopClock();
    this.animatingState.set(true);
    this.cancelAnimation = this.animator.play(this.tableState(), shot, {
      onTable: (table) => this.tableState.set(table),
      onDone: (table, events) => this.finishShot(table, events),
    });
  }

  private finishShot(table: TableState, events: readonly TableEvent[]): void {
    const game = resolveShot(this.gameState(), table, events);

    this.cancelAnimation = null;
    this.gameState.set(game);
    this.tableState.set(game.table);
    this.animatingState.set(false);
    this.startClock();
  }

  private startClock(): void {
    this.stopClock();

    if (this.gameState().phase !== 'aiming') {
      return;
    }

    this.clockState.set({ deadline: performance.now() + SHOT_CLOCK_MS, durationMs: SHOT_CLOCK_MS });
    this.cancelClock = this.timers.schedule(() => this.expireClock(), SHOT_CLOCK_MS);
  }

  private stopClock(): void {
    this.cancelClock?.();
    this.cancelClock = null;
    this.clockState.set(null);
  }

  private expireClock(): void {
    this.cancelClock = null;
    this.gameState.set(forfeitTurn(this.gameState()));
    this.startClock();
  }
}
