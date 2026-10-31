import type { GameState, ShotOutcome } from '@dirtypool/contracts';

const OUTCOME_MESSAGES: Record<ShotOutcome, string> = {
  pocketed: 'Nice. Shoot again.',
  missed: 'Nothing dropped.',
  'opponent-ball': "That one was your opponent's.",
  'wrong-ball': 'Wrong ball first.',
  scratch: 'Scratch! Cue ball back on the spot.',
  'no-contact': 'Air ball.',
  'eight-ball-win': 'The 8 is down.',
  'eight-ball-loss': 'The 8 went in too early.',
};

export function describeGame(game: GameState): string {
  if (game.lastOutcome === null) {
    return 'Open table. Drag to aim, pull the power bar to shoot.';
  }

  return OUTCOME_MESSAGES[game.lastOutcome];
}

export function describeTurn(game: GameState): string {
  if (game.phase === 'finished') {
    return game.winner === null ? 'Game over' : `Player ${game.winner + 1} wins`;
  }

  const group = game.players[game.currentPlayer].group ?? 'open table';

  return `Player ${game.currentPlayer + 1} · ${group}`;
}
