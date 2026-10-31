import type { Vec2 } from '@dirtypool/contracts';

// Only arithmetic and sqrt are used here: trigonometric functions differ across JS engines
// and would break cross-client determinism.
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(vector: Vec2, factor: number): Vec2 {
  return { x: vector.x * factor, y: vector.y * factor };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lengthSquared(vector: Vec2): number {
  return dot(vector, vector);
}

export function length(vector: Vec2): number {
  return Math.sqrt(lengthSquared(vector));
}

export function distance(a: Vec2, b: Vec2): number {
  return length(subtract(a, b));
}

export function normalize(vector: Vec2): Vec2 {
  const magnitude = length(vector);

  return magnitude === 0 ? { x: 0, y: 0 } : scale(vector, 1 / magnitude);
}
