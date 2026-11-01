import { Injectable, inject } from '@angular/core';
import type { Shot, TableState } from '@dirtypool/contracts';
import {
  BALL_RADIUS,
  EIGHT_BALL_ID,
  FIXED_STEP,
  POCKETS,
  isAtRest,
  startShot,
  stepTable,
  type TableEvent,
} from '@dirtypool/game';
import { FRAME_SCHEDULER } from '../types/frame-scheduler.type';
import { AudioService } from './audio.service';

// Browsers throttle frames in unfocused or hidden tabs. Simulating up to a full second per frame
// keeps a throttled client in real time and lets a paused one catch up within a few frames.
const MAX_FRAME_SECONDS = 1;
// The game turns on the 8: time slows while it nears a pocket and for a moment after it drops.
const SLOW_MO_SCALE = 0.3;
const SLOW_MO_HOLD_MS = 500;
const SLOW_MO_RAMP = 0.04;
const SLOW_MO_REACH = BALL_RADIUS * 3;

export interface ShotAnimationHandlers {
  onTable(table: TableState): void;
  onDone(table: TableState, events: readonly TableEvent[]): void;
}

// Animates a shot by stepping the shared fixed-step simulation on every frame, so the client
// shows exactly what the server computes.
@Injectable({ providedIn: 'root' })
export class ShotAnimator {
  private readonly frames = inject(FRAME_SCHEDULER);
  private readonly audio = inject(AudioService);

  // Returns a function that stops the animation without calling `onDone`.
  play(start: TableState, shot: Shot, handlers: ShotAnimationHandlers): () => void {
    const events: TableEvent[] = [];
    let table = startShot(start, shot);
    let accumulator = 0;
    let lastTimestamp: number | null = null;
    let cancelled = false;
    let timeScale = 1;
    let holdUntil = Number.NEGATIVE_INFINITY;

    const frame = (timestamp: number): void => {
      if (cancelled) {
        return;
      }

      const elapsed =
        lastTimestamp === null
          ? FIXED_STEP
          : Math.min(MAX_FRAME_SECONDS, (timestamp - lastTimestamp) / 1000);

      lastTimestamp = timestamp;
      timeScale =
        timestamp < holdUntil || eightBallNearPocket(table)
          ? SLOW_MO_SCALE
          : Math.min(1, timeScale + SLOW_MO_RAMP);
      accumulator += elapsed * timeScale;

      const frameEvents: TableEvent[] = [];

      while (accumulator >= FIXED_STEP && !isAtRest(table)) {
        const result = stepTable(table);

        table = result.table;
        frameEvents.push(...result.events);
        accumulator -= FIXED_STEP;
      }

      if (
        frameEvents.some((event) => event.kind === 'pocketed' && event.ballId === EIGHT_BALL_ID)
      ) {
        holdUntil = timestamp + SLOW_MO_HOLD_MS;
      }

      events.push(...frameEvents);
      this.audio.tableEvents(frameEvents);
      handlers.onTable(table);

      if (isAtRest(table)) {
        handlers.onDone(table, events);
        return;
      }

      this.frames.request(frame);
    };

    this.audio.cueStrike(shot.power);
    handlers.onTable(table);
    this.frames.request(frame);

    return () => {
      cancelled = true;
    };
  }
}

function eightBallNearPocket(table: TableState): boolean {
  const eight = table.balls[EIGHT_BALL_ID];

  if (eight === undefined || eight.pocketed || (eight.velocity.x === 0 && eight.velocity.y === 0)) {
    return false;
  }

  return POCKETS.some((pocket) => {
    const dx = eight.position.x - pocket.position.x;
    const dy = eight.position.y - pocket.position.y;
    const reach = pocket.radius + pocket.mouth + SLOW_MO_REACH;

    return dx * dx + dy * dy < reach * reach;
  });
}
