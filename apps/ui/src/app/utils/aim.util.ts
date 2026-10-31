import type { TableState, Vec2 } from '@dirtypool/contracts';
import {
  BALL_DIAMETER,
  BALL_RADIUS,
  CUE_BALL_ID,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  add,
  distance,
  normalize,
  scale,
  subtract,
} from '@dirtypool/game';
import { MAX_DRAG_DISTANCE } from '../config/table-render.const';
import type { ShotAim } from '../types/shot-aim.type';

const SWEEP_STEP = 0.004;
const MAX_SWEEP_LENGTH = 3;

// Pulling the pointer away from the cue ball aims the shot in the opposite direction.
export function aimFromPointer(table: TableState, pointer: Vec2): ShotAim | null {
  const cue = table.balls.find((ball) => ball.id === CUE_BALL_ID);

  if (cue === undefined || cue.pocketed) {
    return null;
  }

  const pull = subtract(cue.position, pointer);
  const direction = normalize(pull);
  const power = Math.min(1, distance(cue.position, pointer) / MAX_DRAG_DISTANCE);
  const { ghost, targetBallId } = sweepCuePath(table, cue.position, direction);

  return { origin: cue.position, direction, power, ghost, targetBallId };
}

function sweepCuePath(
  table: TableState,
  origin: Vec2,
  direction: Vec2,
): Pick<ShotAim, 'ghost' | 'targetBallId'> {
  const others = table.balls.filter((ball) => ball.id !== CUE_BALL_ID && !ball.pocketed);
  let ghost = origin;

  for (let travelled = 0; travelled < MAX_SWEEP_LENGTH; travelled += SWEEP_STEP) {
    const next = add(origin, scale(direction, travelled));

    if (
      next.x < BALL_RADIUS ||
      next.x > TABLE_WIDTH - BALL_RADIUS ||
      next.y < BALL_RADIUS ||
      next.y > TABLE_HEIGHT - BALL_RADIUS
    ) {
      return { ghost, targetBallId: null };
    }

    const hit = others.find((ball) => distance(ball.position, next) < BALL_DIAMETER);

    if (hit !== undefined) {
      return { ghost, targetBallId: hit.id };
    }

    ghost = next;
  }

  return { ghost, targetBallId: null };
}
