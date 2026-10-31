import type { Vec2 } from '@dirtypool/contracts';

// Maps table metres to canvas pixels.
export interface Viewport {
  readonly scale: number;
  readonly offset: Vec2;
}
