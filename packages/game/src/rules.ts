import type {
  BallGroup,
  BallId,
  GameState,
  PlayerIndex,
  ShotOutcome,
  TableState,
} from '@dirtypool/contracts';
import type { TableEvent } from './physics.js';
import { createRackedTable, placeCueBall } from './rack.js';
import { CUE_BALL_ID, EIGHT_BALL_ID } from './table.const.js';

export const SOLIDS: readonly BallId[] = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES: readonly BallId[] = [9, 10, 11, 12, 13, 14, 15];

export function createGame(): GameState {
  return {
    table: createRackedTable(),
    players: [
      { score: 0, group: null },
      { score: 0, group: null },
    ],
    currentPlayer: 0,
    phase: 'aiming',
    winner: null,
    lastOutcome: null,
    pocketedBalls: [],
  };
}

export function ballGroup(id: BallId): BallGroup | null {
  if (id === CUE_BALL_ID || id === EIGHT_BALL_ID) {
    return null;
  }

  return id < EIGHT_BALL_ID ? 'solids' : 'stripes';
}

export function groupBalls(group: BallGroup): readonly BallId[] {
  return group === 'solids' ? SOLIDS : STRIPES;
}

// 8-ball rules, lightly simplified: the first pocketed ball assigns the groups, you must hit your
// own group first and pocket one of your own to keep the turn, the 8 goes last. A scratch or a
// shot without contact passes the turn; the cue ball goes back on the head spot after a scratch.
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
  const firstContact = events.find((event) => event.kind === 'cue-contact')?.ballId ?? null;
  const pocketedObjectBalls = pocketedIds.filter((id) => ballGroup(id) !== null);
  const pocketedBalls = [...game.pocketedBalls, ...pocketedIds.filter((id) => id !== CUE_BALL_ID)];
  const firstGroup =
    pocketedObjectBalls[0] === undefined ? null : ballGroup(pocketedObjectBalls[0]);
  const assigned =
    game.players[shooter].group === null && firstGroup !== null && !scratched
      ? assignGroups(game.players, shooter, firstGroup)
      : game.players;
  const own = assigned[shooter].group;
  const players = withScores(assigned, table);
  const clearedBeforeShot =
    own !== null && groupBalls(own).every((id) => isPocketed(game.table, id));

  if (pocketedIds.includes(EIGHT_BALL_ID)) {
    const legal = !scratched && clearedBeforeShot;

    return {
      table,
      players,
      currentPlayer: shooter,
      phase: 'finished',
      winner: legal ? shooter : other(shooter),
      lastOutcome: legal ? 'eight-ball-win' : 'eight-ball-loss',
      pocketedBalls,
    };
  }

  const legalContact =
    firstContact !== null &&
    (firstContact === EIGHT_BALL_ID
      ? clearedBeforeShot
      : own === null || ballGroup(firstContact) === own);
  const pocketedOwn = own !== null && pocketedObjectBalls.some((id) => ballGroup(id) === own);
  const outcome: ShotOutcome = scratched
    ? 'scratch'
    : firstContact === null
      ? 'no-contact'
      : !legalContact
        ? 'wrong-ball'
        : pocketedOwn
          ? 'pocketed'
          : pocketedObjectBalls.length > 0
            ? 'opponent-ball'
            : 'missed';
  const keepsTurn = outcome === 'pocketed';

  return {
    table: scratched ? placeCueBall(table) : table,
    players,
    currentPlayer: keepsTurn ? shooter : other(shooter),
    phase: 'aiming',
    winner: null,
    lastOutcome: outcome,
    pocketedBalls,
  };
}

// The shot clock ran out: the turn passes, nothing else changes.
export function forfeitTurn(game: GameState): GameState {
  if (game.phase !== 'aiming') {
    return game;
  }

  return { ...game, currentPlayer: other(game.currentPlayer), lastOutcome: 'timeout' };
}

function assignGroups(
  players: GameState['players'],
  shooter: PlayerIndex,
  group: BallGroup,
): GameState['players'] {
  const opposite: BallGroup = group === 'solids' ? 'stripes' : 'solids';
  const [first, second] = players;

  return shooter === 0
    ? [
        { ...first, group },
        { ...second, group: opposite },
      ]
    : [
        { ...first, group: opposite },
        { ...second, group },
      ];
}

function withScores(players: GameState['players'], table: TableState): GameState['players'] {
  const [first, second] = players;

  return [
    { ...first, score: groupScore(first.group, table) },
    { ...second, score: groupScore(second.group, table) },
  ];
}

function groupScore(group: BallGroup | null, table: TableState): number {
  return group === null ? 0 : groupBalls(group).filter((id) => isPocketed(table, id)).length;
}

function isPocketed(table: TableState, id: BallId): boolean {
  return table.balls.some((ball) => ball.id === id && ball.pocketed);
}

function other(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}
