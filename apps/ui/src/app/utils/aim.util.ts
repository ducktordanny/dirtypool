import type { Ball, Spin, TableState, Vec2 } from '@dirtypool/contracts';
import {
  BALL_DIAMETER,
  BALL_RADIUS,
  CUE_BALL_ID,
  MAX_SHOT_SPEED,
  MAX_SPIN,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  add,
  distance,
  dot,
  length,
  normalize,
  scale,
  subtract,
} from '@dirtypool/game';
import type { ShotAim } from '../types/shot-aim.type';

// Pointers closer than this to the cue ball give no usable direction.
const MIN_POINTER_DISTANCE = 0.01;
const FALLBACK_DIRECTION: Vec2 = { x: 1, y: 0 };

export function cueBall(table: TableState): Ball | null {
  const cue = table.balls.find((ball) => ball.id === CUE_BALL_ID);

  return cue === undefined || cue.pocketed ? null : cue;
}

// The cue ball travels towards the pointer.
export function directionFromPointer(origin: Vec2, pointer: Vec2): Vec2 | null {
  const offset = subtract(pointer, origin);

  return length(offset) < MIN_POINTER_DISTANCE ? null : normalize(offset);
}

export function defaultAimDirection(table: TableState): Vec2 {
  const cue = cueBall(table);

  if (cue === null) {
    return FALLBACK_DIRECTION;
  }

  let nearest: Ball | null = null;

  for (const ball of table.balls) {
    if (ball.id === CUE_BALL_ID || ball.pocketed) {
      continue;
    }

    if (
      nearest === null ||
      distance(cue.position, ball.position) < distance(cue.position, nearest.position)
    ) {
      nearest = ball;
    }
  }

  return nearest === null
    ? FALLBACK_DIRECTION
    : normalize(subtract(nearest.position, cue.position));
}

export function rotateDirection(direction: Vec2, radians: number): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return normalize({
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  });
}

// Spin bends the predicted cue ball path after contact: top spin carries it on, back spin pulls
// it back along the shot line, in the same proportion the simulation applies.
export function aimAlong(
  table: TableState,
  direction: Vec2,
  spin: Spin = { x: 0, y: 0 },
): ShotAim | null {
  const cue = cueBall(table);

  if (cue === null) {
    return null;
  }

  const origin = cue.position;
  let travel = cushionDistance(origin, direction);
  let target: Ball | null = null;

  for (const ball of table.balls) {
    if (ball.id === CUE_BALL_ID || ball.pocketed) {
      continue;
    }

    const hit = ballDistance(origin, direction, ball.position);

    if (hit !== null && hit < travel) {
      travel = hit;
      target = ball;
    }
  }

  const ghost = add(origin, scale(direction, travel));

  if (target === null) {
    return {
      origin,
      direction,
      ghost,
      targetBallId: null,
      targetDirection: null,
      cueDeflection: null,
      cueSpeed: 0,
      fullness: 0,
    };
  }

  const targetDirection = normalize(subtract(target.position, ghost));
  const fullness = Math.max(0, dot(direction, targetDirection));
  const tangent = subtract(direction, scale(targetDirection, fullness));
  const follow = scale(direction, (spin.y * MAX_SPIN * fullness) / MAX_SHOT_SPEED);
  const deflection = add(tangent, follow);

  return {
    origin,
    direction,
    ghost,
    targetBallId: target.id,
    targetDirection,
    cueDeflection: length(deflection) < 1e-3 ? null : normalize(deflection),
    cueSpeed: Math.min(1, length(deflection)),
    fullness,
  };
}

// Distance the cue ball centre can travel before touching a cushion.
function cushionDistance(origin: Vec2, direction: Vec2): number {
  const limits = [
    direction.x > 0 ? (TABLE_WIDTH - BALL_RADIUS - origin.x) / direction.x : Infinity,
    direction.x < 0 ? (BALL_RADIUS - origin.x) / direction.x : Infinity,
    direction.y > 0 ? (TABLE_HEIGHT - BALL_RADIUS - origin.y) / direction.y : Infinity,
    direction.y < 0 ? (BALL_RADIUS - origin.y) / direction.y : Infinity,
  ];

  return Math.max(0, Math.min(...limits));
}

// Distance along the ray until the cue ball touches the given ball centre, or null when it misses.
function ballDistance(origin: Vec2, direction: Vec2, centre: Vec2): number | null {
  const toCentre = subtract(centre, origin);
  const along = dot(toCentre, direction);

  if (along <= 0) {
    return null;
  }

  const perpendicularSquared = dot(toCentre, toCentre) - along * along;
  const reachSquared = BALL_DIAMETER * BALL_DIAMETER - perpendicularSquared;

  if (reachSquared < 0) {
    return null;
  }

  const hit = along - Math.sqrt(reachSquared);

  return hit < 0 ? 0 : hit;
}
