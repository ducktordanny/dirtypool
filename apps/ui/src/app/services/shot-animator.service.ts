import { Injectable, inject } from '@angular/core';
import type { Shot, TableState } from '@dirtypool/contracts';
import { FIXED_STEP, isAtRest, startShot, stepTable, type TableEvent } from '@dirtypool/game';
import { FRAME_SCHEDULER } from '../types/frame-scheduler.type';

const MAX_FRAME_SECONDS = 0.1;

export interface ShotAnimationHandlers {
  onTable(table: TableState): void;
  onDone(table: TableState, events: readonly TableEvent[]): void;
}

// Animates a shot by stepping the shared fixed-step simulation on every frame, so the client
// shows exactly what the server computes.
@Injectable({ providedIn: 'root' })
export class ShotAnimator {
  private readonly frames = inject(FRAME_SCHEDULER);

  // Returns a function that stops the animation without calling `onDone`.
  play(start: TableState, shot: Shot, handlers: ShotAnimationHandlers): () => void {
    const events: TableEvent[] = [];
    let table = startShot(start, shot);
    let accumulator = 0;
    let lastTimestamp: number | null = null;
    let cancelled = false;

    const frame = (timestamp: number): void => {
      if (cancelled) {
        return;
      }

      const elapsed =
        lastTimestamp === null
          ? FIXED_STEP
          : Math.min(MAX_FRAME_SECONDS, (timestamp - lastTimestamp) / 1000);

      lastTimestamp = timestamp;
      accumulator += elapsed;

      while (accumulator >= FIXED_STEP && !isAtRest(table)) {
        const result = stepTable(table);

        table = result.table;
        events.push(...result.events);
        accumulator -= FIXED_STEP;
      }

      handlers.onTable(table);

      if (isAtRest(table)) {
        handlers.onDone(table, events);
        return;
      }

      this.frames.request(frame);
    };

    handlers.onTable(table);
    this.frames.request(frame);

    return () => {
      cancelled = true;
    };
  }
}
