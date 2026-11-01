import { TestBed } from '@angular/core/testing';
import type { TableState } from '@dirtypool/contracts';
import { CUE_BALL_ID, createRackedTable, distance, isAtRest } from '@dirtypool/game';
import { FRAME_SCHEDULER, type FrameCallback } from '../types/frame-scheduler.type';
import { ShotAnimator } from './shot-animator.service';

// Hands out frames with whatever timestamps the test chooses.
class SteppedFrameScheduler {
  private queue: FrameCallback[] = [];

  request(callback: FrameCallback): void {
    this.queue.push(callback);
  }

  frame(timestamp: number): void {
    const callbacks = this.queue;

    this.queue = [];
    callbacks.forEach((callback) => callback(timestamp));
  }
}

function cuePosition(table: TableState) {
  return table.balls.find((ball) => ball.id === CUE_BALL_ID)?.position ?? { x: 0, y: 0 };
}

describe('ShotAnimator', () => {
  let animator: ShotAnimator;
  let frames: SteppedFrameScheduler;

  beforeEach(() => {
    frames = new SteppedFrameScheduler();
    TestBed.configureTestingModule({ providers: [{ provide: FRAME_SCHEDULER, useValue: frames }] });
    animator = TestBed.inject(ShotAnimator);
  });

  it('catches up a whole second of play in one frame after a throttled gap', () => {
    const start = createRackedTable();
    let latest = start;

    animator.play(
      start,
      { direction: { x: -1, y: 0 }, power: 0.4 },
      {
        onTable: (table) => {
          latest = table;
        },
        onDone: () => undefined,
      },
    );

    frames.frame(0);
    frames.frame(1000);

    expect(distance(cuePosition(latest), cuePosition(start))).toBeGreaterThan(0.5);
  });

  it('stops delivering frames once cancelled', () => {
    const start = createRackedTable();
    let updates = 0;

    const cancel = animator.play(
      start,
      { direction: { x: -1, y: 0 }, power: 0.4 },
      {
        onTable: () => {
          updates += 1;
        },
        onDone: () => undefined,
      },
    );

    frames.frame(0);
    cancel();
    frames.frame(16);
    frames.frame(32);

    expect(updates).toBe(2);
    expect(isAtRest(start)).toBe(true);
  });
});
