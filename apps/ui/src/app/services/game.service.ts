import { Injectable, computed, inject, signal } from '@angular/core';
import type { GameState, Shot, TableState, Vec2 } from '@dirtypool/contracts';
import {
  SHOT_CLOCK_MS,
  createGame,
  forfeitTurn,
  placeBallInHand,
  resolveShot,
  type TableEvent,
} from '@dirtypool/game';
import type { ShotAnnouncement } from '../types/shot-announcement.type';
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
  readonly lastShot = computed(() => this.lastShotState());
  readonly canShoot = computed(() => !this.animatingState() && this.gameState().phase === 'aiming');

  private readonly animator = inject(ShotAnimator);
  private readonly timers = inject(TIMER_SCHEDULER);
  private readonly gameState = signal<GameState>(createGame());
  private readonly tableState = signal<TableState>(this.gameState().table);
  private readonly animatingState = signal(false);
  private readonly clockState = signal<ShotClock | null>(null);
  private readonly lastShotState = signal<ShotAnnouncement | null>(null);
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
    this.lastShotState.set(null);
    this.startClock();
  }

  // Ball in hand: preview the cue ball under the pointer, then commit or snap back on release.
  moveCueBall(position: Vec2): void {
    if (this.canShoot() && this.gameState().ballInHand) {
      this.tableState.set(previewCueBall(this.gameState().table, position));
    }
  }

  placeCueBall(position: Vec2): void {
    const game = this.gameState();

    if (!this.canShoot() || !game.ballInHand) {
      return;
    }

    const table = placeBallInHand(game.table, position);

    if (table !== null) {
      this.gameState.set({ ...game, table });
    }

    this.tableState.set(table ?? game.table);
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
    this.announce(game);
    this.startClock();
  }

  private announce(game: GameState): void {
    if (game.lastOutcome !== null) {
      const previous = this.lastShotState();

      this.lastShotState.set({ seq: (previous?.seq ?? 0) + 1, outcome: game.lastOutcome });
    }
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
    const game = forfeitTurn(this.gameState());

    this.cancelClock = null;
    this.gameState.set(game);
    this.announce(game);
    this.startClock();
  }
}

function previewCueBall(table: TableState, position: Vec2): TableState {
  return {
    balls: table.balls.map((ball) => (ball.id === 0 ? { ...ball, position } : ball)),
  };
}
