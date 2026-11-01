import type { BallId, Vec2 } from '@dirtypool/contracts';

export interface ShotAim {
  readonly origin: Vec2;
  readonly direction: Vec2;
  // Where the cue ball stops travelling freely: the first ball contact, cushion or trap.
  readonly ghost: Vec2;
  // The simulated route from the origin to the ghost, as points a few centimetres apart.
  readonly path: readonly Vec2[];
  readonly targetBallId: BallId | null;
  // Unit directions after contact, when the cue ball hits an object ball.
  readonly targetDirection: Vec2 | null;
  readonly cueDeflection: Vec2 | null;
  // Cue ball speed right after contact as a share of the shot speed; 0 when nothing is hit.
  readonly cueSpeed: number;
  // 1 for a full hit, approaching 0 for the thinnest cut.
  readonly fullness: number;
}
