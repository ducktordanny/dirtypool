import type { BallId, TableState, Vec2 } from '@dirtypool/contracts';

// Position of the ball the cue ball would hit first when hitting it first is a foul.
export function foulTargetPosition(
  table: TableState,
  targetBallId: BallId | null,
  legalTargets: readonly BallId[] | null,
): Vec2 | null {
  if (targetBallId === null || legalTargets === null || legalTargets.includes(targetBallId)) {
    return null;
  }

  return table.balls.find((ball) => ball.id === targetBallId)?.position ?? null;
}
