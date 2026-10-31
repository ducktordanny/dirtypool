import type { GameState, PlayerIndex, ShotOutcome, TableState } from '@dirtypool/contracts';
import type { TableEvent } from './physics.js';
import { createRackedTable, placeCueBall } from './rack.js';
import { CUE_BALL_ID, EIGHT_BALL_ID } from './table.const.js';

export function createGame(): GameState {
  return {
    table: createRackedTable(),
    players: [{ score: 0 }, { score: 0 }],
    currentPlayer: 0,
    phase: 'aiming',
    winner: null,
    lastOutcome: null,
  };
}

// Simplified rules: any pocketed object ball scores and keeps the turn, the 8 must go last,
// a scratch or a shot without contact passes the turn.
export function resolveShot(
  game: GameState,
  table: TableState,
  events: readonly TableEvent[],
): GameState {
  if (game.phase !== 'aiming') {
    return game;
  }

  const shooter = game.currentPlayer;
  const pocketedIds = events
    .filter((event) => event.kind === 'pocketed')
    .map((event) => event.ballId);
  const scratched = pocketedIds.includes(CUE_BALL_ID);
  const madeContact = events.some((event) => event.kind === 'cue-contact');
  const pocketedObjectBalls = pocketedIds.filter(
    (id) => id !== CUE_BALL_ID && id !== EIGHT_BALL_ID,
  ).length;
  const objectBallsRemaining = table.balls.some(
    (ball) => ball.id !== CUE_BALL_ID && ball.id !== EIGHT_BALL_ID && !ball.pocketed,
  );
  const players = addScore(game.players, shooter, pocketedObjectBalls);

  if (pocketedIds.includes(EIGHT_BALL_ID)) {
    const legal = !scratched && !objectBallsRemaining;
    const winner = legal ? higherScorer(players, shooter) : other(shooter);

    return {
      table,
      players,
      currentPlayer: shooter,
      phase: 'finished',
      winner,
      lastOutcome: legal ? 'eight-ball-win' : 'eight-ball-loss',
    };
  }

  const outcome: ShotOutcome = scratched
    ? 'scratch'
    : !madeContact
      ? 'no-contact'
      : pocketedObjectBalls > 0
        ? 'pocketed'
        : 'missed';
  const keepsTurn = outcome === 'pocketed';

  return {
    table: scratched ? placeCueBall(table) : table,
    players,
    currentPlayer: keepsTurn ? shooter : other(shooter),
    phase: 'aiming',
    winner: null,
    lastOutcome: outcome,
  };
}

function addScore(
  players: GameState['players'],
  player: PlayerIndex,
  amount: number,
): GameState['players'] {
  const [first, second] = players;

  return player === 0
    ? [{ score: first.score + amount }, second]
    : [first, { score: second.score + amount }];
}

function higherScorer(players: GameState['players'], tieBreaker: PlayerIndex): PlayerIndex {
  const [first, second] = players;

  if (first.score === second.score) {
    return tieBreaker;
  }

  return first.score > second.score ? 0 : 1;
}

function other(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}
