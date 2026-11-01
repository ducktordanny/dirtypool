import type { Ball, Shot, Spin, TableState, Vec2 } from '@dirtypool/contracts';
import {
  CUE_BALL_ID,
  FIXED_STEP,
  distance,
  dot,
  length,
  normalize,
  startShot,
  stepTable,
  subtract,
} from '@dirtypool/game';
import { MIN_SHOT_POWER } from '../config/table-render.const';
import type { ShotAim } from '../types/shot-aim.type';

// Pointers closer than this to the cue ball give no usable direction.
const MIN_POINTER_DISTANCE = 0.01;
const FALLBACK_DIRECTION: Vec2 = { x: 1, y: 0 };
// The guide is simulated at this power until the player pulls the bar.
const GUIDE_POWER = 0.5;
// How far ahead the guide looks; a ball caught in a well would otherwise swing for seconds.
const GUIDE_MAX_STEPS = Math.ceil(2 / FIXED_STEP);
// Spacing of the dots along the predicted path, in metres.
const PATH_DOT_SPACING = 0.03;
// Below this share of its speed the cue ball is as good as stopped by the hit.
const MIN_DEFLECTION_SHARE = 0.05;

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

// Runs the real simulation for the cue ball alone until its first contact, so the guide bends
// through fields, stops at bumpers and walls, and carries the spin the shot would have. Without a
// pulled power bar it assumes a medium shot.
export function aimAlong(
  table: TableState,
  direction: Vec2,
  spin: Spin = { x: 0, y: 0 },
  power = 0,
): ShotAim | null {
  const cue = cueBall(table);

  if (cue === null) {
    return null;
  }

  const origin = cue.position;
  const shot: Shot = {
    direction,
    power: power >= MIN_SHOT_POWER ? power : GUIDE_POWER,
    ...(spin.x === 0 && spin.y === 0 ? {} : { spin }),
  };
  const path: Vec2[] = [origin];
  let current = startShot(table, shot);
  let miss: ShotAim = {
    origin,
    direction,
    ghost: origin,
    path,
    targetBallId: null,
    targetDirection: null,
    cueDeflection: null,
    cueSpeed: 0,
    fullness: 0,
  };

  for (let step = 0; step < GUIDE_MAX_STEPS; step += 1) {
    const before = current.balls[CUE_BALL_ID];
    const result = stepTable(current);
    const after = result.table.balls[CUE_BALL_ID];

    if (before === undefined || after === undefined) {
      return miss;
    }

    current = result.table;

    const contact = result.events.find((event) => event.kind === 'cue-contact');

    if (contact !== undefined) {
      const target = current.balls.find((ball) => ball.id === contact.ballId);
      const heading = normalize(before.velocity);
      const targetDirection = target === undefined ? null : normalize(target.velocity);
      const speedBefore = length(before.velocity);
      const cueSpeed = speedBefore === 0 ? 0 : Math.min(1, length(after.velocity) / speedBefore);

      path.push(after.position);

      return {
        origin,
        direction,
        ghost: after.position,
        path,
        targetBallId: contact.ballId,
        targetDirection,
        cueDeflection: cueSpeed < MIN_DEFLECTION_SHARE ? null : normalize(after.velocity),
        cueSpeed,
        fullness:
          target === undefined
            ? 0
            : Math.max(0, dot(heading, normalize(subtract(target.position, after.position)))),
      };
    }

    const stopped =
      after.pocketed ||
      (after.velocity.x === 0 && after.velocity.y === 0) ||
      result.events.some(
        (event) =>
          (event.kind === 'cushion' || event.kind === 'bumper') && event.ballId === CUE_BALL_ID,
      );

    if (stopped || distance(after.position, path[path.length - 1] ?? origin) >= PATH_DOT_SPACING) {
      path.push(after.position);
    }

    miss = { ...miss, ghost: after.position };

    if (stopped) {
      return miss;
    }
  }

  return miss;
}
