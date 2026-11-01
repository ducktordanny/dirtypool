import type { BallId } from '@dirtypool/contracts';
import { TABLE_HEIGHT, TABLE_WIDTH } from '@dirtypool/game';

// Visual frame around the playing surface, in metres: rubber cushions, then the wooden rail.
export const CUSHION_WIDTH = 0.04;
export const RAIL_WIDTH = 0.078;
export const FRAME_WIDTH = CUSHION_WIDTH + RAIL_WIDTH;
export const TABLE_ASPECT_RATIO =
  (TABLE_WIDTH + FRAME_WIDTH * 2) / (TABLE_HEIGHT + FRAME_WIDTH * 2);

export const MIN_SHOT_POWER = 0.05;
export const CUE_LENGTH = 1.47;
export const CUE_TIP_GAP = 0.012;
// A full-power shot draws the cue tip this far back from the cue ball.
export const CUE_MAX_PULL = 0.32;
export const STRIKE_DURATION_MS = 90;
// After impact the cue keeps going this far past where the ball sat while it fades out.
export const CUE_FOLLOW_THROUGH = 0.05;
export const FOLLOW_THROUGH_MS = 220;
// Radians per arrow-key press while fine-tuning the aim.
export const AIM_ROTATE_STEP = 0.0035;

// Base tint for the generated cloth texture.
export const CLOTH_RGB = [40, 104, 165] as const;

export const TABLE_COLORS = {
  cushion: 0x5597c9,
  cushionTop: 0x6fb0dc,
  cushionNose: 0x2f6a99,
  rail: 0xa9372f,
  railBevel: 0xc4493d,
  railEdge: 0x5a1b17,
  pocket: 0x000000,
  pocketRim: 0x3a0e0c,
  sight: 0xf3e9d8,
  marking: 0xffffff,
  shadow: 0x000000,
  guide: 0xffffff,
  foul: 0xff5a5a,
  cueTip: 0x3a6ea5,
  cueFerrule: 0xf1ead8,
  cueShaft: 0xd8b27a,
  cueJoint: 0xe9e2d0,
  cueForearm: 0x5a2d14,
  cueWrap: 0x1d1a18,
  cueSleeve: 0x4a2410,
  cueBumper: 0x111111,
} as const;

export const TRAP_COLORS = {
  bumperRubber: 0xd93a4a,
  bumperCap: 0xf4f1ea,
  well: 0x1b0f3a,
  wellSwirl: 0xa78bfa,
} as const;

// Marks what belongs to whom on the table: player 1 gold, player 2 cyan.
export const PLAYER_COLORS = [0xf2c14e, 0x4cc9f0] as const;

const SOLID_COLORS: Readonly<Record<number, number>> = {
  1: 0xffd34d,
  2: 0x3d7eff,
  3: 0xff5a5a,
  4: 0x9b5de5,
  5: 0xff9b3d,
  6: 0x3fbf6e,
  7: 0xc23b4a,
};

export function ballColor(id: BallId): number {
  if (id === 0) {
    return 0xfaf8f2;
  }

  if (id === 8) {
    return 0x1a1a1a;
  }

  return SOLID_COLORS[id > 8 ? id - 8 : id] ?? 0xffffff;
}

export function isStripe(id: BallId): boolean {
  return id > 8;
}

export function ballCssColor(id: BallId): string {
  return `#${ballColor(id).toString(16).padStart(6, '0')}`;
}
