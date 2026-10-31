import type { GameState } from '@dirtypool/contracts';

const OUTCOME_MESSAGES: Record<NonNullable<GameState['lastOutcome']>, string> = {
  pocketed: 'Nice. Shoot again.',
  missed: 'Nothing dropped. Next player.',
  scratch: 'Scratch! Cue ball goes back on the spot.',
  'no-contact': 'Air ball. Next player.',
  'eight-ball-win': 'The 8 is down. Game over.',
  'eight-ball-loss': 'The 8 went in too early. Game over.',
};

export function describeGame(game: GameState): string {
  if (game.phase === 'finished' && game.winner !== null) {
    return `Player ${game.winner + 1} wins!`;
  }

  if (game.lastOutcome === null) {
    return 'Player 1 breaks. Drag back from the cue ball and release.';
  }

  return OUTCOME_MESSAGES[game.lastOutcome];
}
