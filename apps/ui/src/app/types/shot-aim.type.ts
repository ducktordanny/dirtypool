import type { BallId, Vec2 } from '@dirtypool/contracts';

export interface ShotAim {
  readonly origin: Vec2;
  readonly direction: Vec2;
  readonly power: number;
  readonly ghost: Vec2;
  readonly targetBallId: BallId | null;
}
