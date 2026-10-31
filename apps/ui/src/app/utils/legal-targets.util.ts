import type { BallId, GameState } from '@dirtypool/contracts';
import { EIGHT_BALL_ID, SOLIDS, STRIPES, groupBalls } from '@dirtypool/game';

// Balls the player on turn may hit first without a foul, mirroring resolveShot: anything on the
// break, anything but the 8 while the table is open, your own group, then the 8.
export function legalTargetIds(game: GameState): readonly BallId[] {
  const onTable = (ids: readonly BallId[]): BallId[] =>
    ids.filter((id) => game.table.balls.some((ball) => ball.id === id && !ball.pocketed));

  if (game.lastOutcome === null) {
    return onTable([...SOLIDS, EIGHT_BALL_ID, ...STRIPES]);
  }

  const group = game.players[game.currentPlayer].group;

  if (group === null) {
    return onTable([...SOLIDS, ...STRIPES]);
  }

  const own = onTable(groupBalls(group));

  return own.length > 0 ? own : [EIGHT_BALL_ID];
}
