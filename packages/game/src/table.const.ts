import type { BallId, Vec2 } from '@dirtypool/contracts';

// All lengths are metres, all speeds metres per second.
export const TABLE_WIDTH = 2.24;
export const TABLE_HEIGHT = 1.12;
export const BALL_RADIUS = 0.028575;
export const BALL_DIAMETER = BALL_RADIUS * 2;

export const CUE_BALL_ID: BallId = 0;
export const EIGHT_BALL_ID: BallId = 8;
export const BALL_COUNT = 16;

export const HEAD_SPOT: Vec2 = { x: TABLE_WIDTH / 4, y: TABLE_HEIGHT / 2 };
export const FOOT_SPOT: Vec2 = { x: (TABLE_WIDTH * 3) / 4, y: TABLE_HEIGHT / 2 };

export interface Pocket {
  readonly position: Vec2;
  // A ball is pocketed once its centre is within this distance.
  readonly radius: number;
  // The cushions stop this far beyond the radius: inside, a ball is never reflected.
  readonly mouth: number;
}

// Pocket centres sit slightly outside the playing surface, inside the rail. In the mouth the
// cushions no longer reflect a ball; once it overlaps the hole enough, LIP_PULL draws it in so it
// never hangs on the edge.
const CORNER_OUTSET = 0.025;
const SIDE_OUTSET = 0.055;
const CORNER = { radius: 0.072, mouth: 0.045 };
const SIDE = { radius: 0.056, mouth: 0.055 };

export const POCKETS: readonly Pocket[] = [
  { position: { x: -CORNER_OUTSET, y: -CORNER_OUTSET }, ...CORNER },
  { position: { x: TABLE_WIDTH / 2, y: -SIDE_OUTSET }, ...SIDE },
  { position: { x: TABLE_WIDTH + CORNER_OUTSET, y: -CORNER_OUTSET }, ...CORNER },
  { position: { x: -CORNER_OUTSET, y: TABLE_HEIGHT + CORNER_OUTSET }, ...CORNER },
  { position: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT + SIDE_OUTSET }, ...SIDE },
  { position: { x: TABLE_WIDTH + CORNER_OUTSET, y: TABLE_HEIGHT + CORNER_OUTSET }, ...CORNER },
];

// Acceleration towards the pocket centre while a ball is on the lip, in m/s^2.
export const LIP_PULL = 3;
// A ball overlapping the hole by this fraction of its radius is on the lip.
export const LIP_OVERLAP = 0.25;

export const MAX_SHOT_SPEED = 6;
export const ROLLING_DECELERATION = 0.25;
// Extra slowing proportional to speed (per second), so hard shots settle without braking the tail.
export const SPEED_DRAG = 0.12;
export const REST_SPEED = 0.02;
export const BALL_RESTITUTION = 0.96;
export const CUSHION_RESTITUTION = 0.7;

// Spin is stored as the velocity it can still turn into. A full-power shot struck at the edge
// of the cue ball carries MAX_SPIN; it bleeds off at SPIN_DECAY per second while rolling.
export const MAX_SPIN = 2.4;
export const SPIN_DECAY = 0.6;
// Fraction of side spin that becomes sideways velocity on a square cushion hit.
export const SIDE_SPIN_GRIP = 0.5;

// Every client and the server must step with exactly this value for identical results.
export const FIXED_STEP = 1 / 480;
export const MAX_SHOT_SECONDS = 60;
export const MAX_SHOT_STEPS = Math.ceil(MAX_SHOT_SECONDS / FIXED_STEP);

// A player has this long to take a shot once the balls are still; then the turn passes.
export const SHOT_CLOCK_MS = 30_000;
