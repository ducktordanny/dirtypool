import type { GameState, ShotOutcome } from '@dirtypool/contracts';

const OUTCOME_MESSAGES: Record<ShotOutcome, string> = {
  pocketed: 'Nice. Shoot again.',
  missed: 'Nothing dropped.',
  'opponent-ball': "That one was your opponent's.",
  'wrong-ball': 'Wrong ball first.',
  scratch: 'Scratch! Cue ball back on the spot.',
  'no-contact': 'Air ball.',
  timeout: 'Time ran out.',
  'eight-ball-win': 'The 8 is down.',
  'eight-ball-loss': 'The 8 went in too early.',
};

export function describeGame(game: GameState): string {
  if (game.lastOutcome === null) {
    return 'Open table. Drag to aim, pull the power bar to shoot.';
  }

  const message = OUTCOME_MESSAGES[game.lastOutcome];

  return game.ballInHand && game.phase === 'aiming'
    ? `${message} Ball in hand: drag the cue ball anywhere.`
    : message;
}

export function describeTurn(game: GameState, names: readonly [string, string]): string {
  if (game.phase === 'finished') {
    if (game.winner === null) {
      return 'Game over';
    }

    return `${names[game.winner]} wins`;
  }

  const group = game.players[game.currentPlayer].group ?? 'open table';

  return `${names[game.currentPlayer]} · ${group}`;
}
