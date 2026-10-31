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
  readonly radius: number;
}

export const POCKETS: readonly Pocket[] = [
  { position: { x: 0, y: 0 }, radius: 0.05 },
  { position: { x: TABLE_WIDTH / 2, y: 0 }, radius: 0.045 },
  { position: { x: TABLE_WIDTH, y: 0 }, radius: 0.05 },
  { position: { x: 0, y: TABLE_HEIGHT }, radius: 0.05 },
  { position: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, radius: 0.045 },
  { position: { x: TABLE_WIDTH, y: TABLE_HEIGHT }, radius: 0.05 },
];

export const MAX_SHOT_SPEED = 7;
export const ROLLING_DECELERATION = 0.9;
export const REST_SPEED = 0.02;
export const BALL_RESTITUTION = 0.96;
export const CUSHION_RESTITUTION = 0.7;

// Every client and the server must step with exactly this value for identical results.
export const FIXED_STEP = 1 / 480;
export const MAX_SHOT_SECONDS = 60;
export const MAX_SHOT_STEPS = Math.ceil(MAX_SHOT_SECONDS / FIXED_STEP);
