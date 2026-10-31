import type { BallId } from '@dirtypool/contracts';
import { TABLE_HEIGHT, TABLE_WIDTH } from '@dirtypool/game';

// Width of the wooden rail drawn around the playing surface, in metres.
export const RAIL_WIDTH = 0.08;
export const TABLE_ASPECT_RATIO = (TABLE_WIDTH + RAIL_WIDTH * 2) / (TABLE_HEIGHT + RAIL_WIDTH * 2);
// Pulling the cue ball back this far (in metres) is a full-power shot.
export const MAX_DRAG_DISTANCE = 0.5;
export const MIN_SHOT_POWER = 0.05;

export const TABLE_COLORS = {
  rail: 0x5b3a1e,
  felt: 0x1f7a4d,
  pocket: 0x0b0d10,
  aim: 0xffffff,
  ghost: 0xffffff,
} as const;

const SOLID_COLORS: Readonly<Record<number, number>> = {
  1: 0xf2c14e,
  2: 0x2f6fdb,
  3: 0xe5484d,
  4: 0x7b4fbf,
  5: 0xf2893d,
  6: 0x2f9e5b,
  7: 0x8c2f39,
};

export function ballColor(id: BallId): number {
  if (id === 0) {
    return 0xffffff;
  }

  if (id === 8) {
    return 0x111111;
  }

  return SOLID_COLORS[id > 8 ? id - 8 : id] ?? 0xffffff;
}

export function isStripe(id: BallId): boolean {
  return id > 8;
}
