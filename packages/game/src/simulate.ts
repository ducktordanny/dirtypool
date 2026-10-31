import type { Shot, TableState } from '@dirtypool/contracts';
import { isAtRest, stepTable, type TableEvent } from './physics.js';
import { CUE_BALL_ID, FIXED_STEP, MAX_SHOT_SPEED, MAX_SHOT_STEPS } from './table.const.js';
import { normalize, scale } from './vec2.util.js';

export interface ShotResult {
  readonly table: TableState;
  readonly events: readonly TableEvent[];
  // How long the balls roll, so a server can allow for the animation before the next turn.
  readonly durationSeconds: number;
}

export function startShot(table: TableState, shot: Shot): TableState {
  const velocity = scale(normalize(shot.direction), shot.power * MAX_SHOT_SPEED);

  return {
    balls: table.balls.map((ball) =>
      ball.id === CUE_BALL_ID && !ball.pocketed ? { ...ball, velocity } : ball,
    ),
  };
}

// Runs a shot to rest in one go. Clients animate with stepTable instead and must end up
// with exactly this table, since both run the same fixed-step sequence.
export function simulateShot(table: TableState, shot: Shot): ShotResult {
  let current = startShot(table, shot);
  const events: TableEvent[] = [];
  let steps = 0;

  for (; steps < MAX_SHOT_STEPS && !isAtRest(current); steps += 1) {
    const result = stepTable(current);

    current = result.table;
    events.push(...result.events);
  }

  return { table: current, events, durationSeconds: steps * FIXED_STEP };
}
