import type { BallId, Vec2 } from '@dirtypool/contracts';
import { BALL_RADIUS, CUE_BALL_ID } from '@dirtypool/game';
import type { Graphics } from 'pixi.js';
import { ballColor } from '../../config/table-render.const';
import type { Viewport } from '../../types/viewport.type';
import { toScreen } from '../../utils/viewport.util';

const BURST_MS = 520;
const PARTICLES = 10;
const SCRATCH_COLOR = 0xff5a5a;

export interface PocketBurst {
  readonly centre: Vec2;
  readonly color: number;
  readonly startedAt: number;
}

// A ring and sparks in the ball's colour at the pocket; red for a scratched cue ball.
export function startPocketBurst(id: BallId, pocket: Vec2, now: number): PocketBurst {
  return {
    centre: pocket,
    color: id === CUE_BALL_ID ? SCRATCH_COLOR : ballColor(id),
    startedAt: now,
  };
}

// Draws every live burst and drops the finished ones from the list.
export function drawPocketBursts(
  graphics: Graphics,
  bursts: PocketBurst[],
  now: number,
  viewport: Viewport,
): void {
  graphics.clear();

  for (let index = bursts.length - 1; index >= 0; index -= 1) {
    const burst = bursts[index];

    if (burst === undefined) {
      continue;
    }

    const progress = (now - burst.startedAt) / BURST_MS;

    if (progress >= 1) {
      bursts.splice(index, 1);
      continue;
    }

    const centre = toScreen(burst.centre, viewport);
    const radius = BALL_RADIUS * viewport.scale;
    const eased = 1 - (1 - progress) * (1 - progress);
    const alpha = 1 - progress;

    graphics
      .circle(centre.x, centre.y, radius * (1 + eased * 2.4))
      .stroke({ color: burst.color, width: Math.max(2, radius * 0.25 * (1 - eased)), alpha });

    for (let particle = 0; particle < PARTICLES; particle += 1) {
      const angle = (particle / PARTICLES) * Math.PI * 2 + burst.startedAt * 0.001;
      const distance = radius * (0.8 + eased * 3.2);
      const size = radius * 0.18 * (1 - progress * 0.6);

      graphics
        .circle(centre.x + Math.cos(angle) * distance, centre.y + Math.sin(angle) * distance, size)
        .fill({ color: burst.color, alpha });
    }
  }
}
