import type { GameState } from '@dirtypool/contracts';
import { createGame } from '@dirtypool/game';
import { legalTargetIds } from './legal-targets.util';

function pocket(game: GameState, ids: readonly number[]): GameState {
  return {
    ...game,
    table: {
      ...game.table,
      balls: game.table.balls.map((ball) =>
        ids.includes(ball.id) ? { ...ball, pocketed: true } : ball,
      ),
    },
  };
}

describe('legalTargetIds', () => {
  it('allows every ball on the break', () => {
    expect(legalTargetIds(createGame())).toHaveLength(15);
  });

  it('excludes the 8 while the table is open', () => {
    const game: GameState = { ...createGame(), lastOutcome: 'missed' };

    expect(legalTargetIds(game)).not.toContain(8);
    expect(legalTargetIds(game)).toHaveLength(14);
  });

  it('limits a player to their own remaining group', () => {
    const game: GameState = {
      ...pocket(createGame(), [1, 2]),
      lastOutcome: 'pocketed',
      players: [
        { score: 2, group: 'solids', trapsLeft: 4 },
        { score: 0, group: 'stripes', trapsLeft: 4 },
      ],
    };

    expect(legalTargetIds(game)).toEqual([3, 4, 5, 6, 7]);
  });

  it('allows only the 8 once the group is cleared', () => {
    const game: GameState = {
      ...pocket(createGame(), [1, 2, 3, 4, 5, 6, 7]),
      lastOutcome: 'pocketed',
      players: [
        { score: 7, group: 'solids', trapsLeft: 4 },
        { score: 0, group: 'stripes', trapsLeft: 4 },
      ],
    };

    expect(legalTargetIds(game)).toEqual([8]);
  });
});
