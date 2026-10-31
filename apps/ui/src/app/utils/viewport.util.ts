import type { Vec2 } from '@dirtypool/contracts';
import { TABLE_HEIGHT, TABLE_WIDTH } from '@dirtypool/game';
import { FRAME_WIDTH } from '../config/table-render.const';
import type { Viewport } from '../types/viewport.type';

export function measureViewport(width: number, height: number): Viewport {
  const scale = Math.min(
    width / (TABLE_WIDTH + FRAME_WIDTH * 2),
    height / (TABLE_HEIGHT + FRAME_WIDTH * 2),
  );

  return {
    scale,
    offset: { x: (width - TABLE_WIDTH * scale) / 2, y: (height - TABLE_HEIGHT * scale) / 2 },
  };
}

export function toScreen(point: Vec2, { scale, offset }: Viewport): Vec2 {
  return { x: point.x * scale + offset.x, y: point.y * scale + offset.y };
}

export function toWorld(point: Vec2, { scale, offset }: Viewport): Vec2 {
  return { x: (point.x - offset.x) / scale, y: (point.y - offset.y) / scale };
}
