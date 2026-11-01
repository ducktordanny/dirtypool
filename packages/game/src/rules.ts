import type {
  BallGroup,
  BallId,
  GameState,
  PlayerIndex,
  ShotOutcome,
  TableState,
  Vec2,
} from '@dirtypool/contracts';
import type { TableEvent } from './physics.js';
import { createRackedTable, placeBallInHand, placeCueBall, rackOrder } from './rack.js';
import { CUE_BALL_ID, EIGHT_BALL_ID, TRAPS_PER_PLAYER } from './table.const.js';
import { ageTraps } from './traps.js';

export const SOLIDS: readonly BallId[] = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES: readonly BallId[] = [9, 10, 11, 12, 13, 14, 15];

// Without a random source the rack is the fixed one, which tests rely on.
export function createGame(random?: () => number): GameState {
  return {
    table: createRackedTable(random === undefined ? undefined : rackOrder(random)),
    players: [
      { score: 0, group: null, trapsLeft: TRAPS_PER_PLAYER },
      { score: 0, group: null, trapsLeft: TRAPS_PER_PLAYER },
    ],
    currentPlayer: 0,
    phase: 'aiming',
    winner: null,
    lastOutcome: null,
    pocketedBalls: [],
    // The breaker may move the cue ball anywhere behind the head string first.
    ballInHand: true,
    trapPlaced: false,
  };
}

// Where the cue ball may be put down with ball in hand depends on whether this is the break.
export function placeCueBallInHand(game: GameState, position: Vec2): TableState | null {
  return placeBallInHand(game.table, position, game.lastOutcome === null);
}

const FOULS: readonly ShotOutcome[] = ['scratch', 'wrong-ball', 'no-contact', 'timeout'];

export function ballGroup(id: BallId): BallGroup | null {
  if (id === CUE_BALL_ID || id === EIGHT_BALL_ID) {
    return null;
  }

  return id < EIGHT_BALL_ID ? 'solids' : 'stripes';
}

export function groupBalls(group: BallGroup): readonly BallId[] {
  return group === 'solids' ? SOLIDS : STRIPES;
}

// 8-ball rules, lightly simplified. The first pocketed ball, on the break or later, assigns the
// groups; you must hit your own group first (anything but the 8
// while the table is open) and pocket one of your own to keep the turn, and the 8 goes last. A
// scratch or a shot without contact passes the turn; the cue ball goes back on the head spot
// after a scratch.
export function resolveShot(
  game: GameState,
  settled: TableState,
  events: readonly TableEvent[],
): GameState {
  if (game.phase !== 'aiming') {
    return game;
  }

  const table = ageTraps(settled);
  const shooter = game.currentPlayer;
  const breaking = game.lastOutcome === null;
  const pocketedIds = events
    .filter((event) => event.kind === 'pocketed' || event.kind === 'swallowed')
    .map((event) => event.ballId);
  const scratched = pocketedIds.includes(CUE_BALL_ID);
  const firstContact = events.find((event) => event.kind === 'cue-contact')?.ballId ?? null;
  const pocketedObjectBalls = pocketedIds.filter((id) => ballGroup(id) !== null);
  const pocketedBalls = [...game.pocketedBalls, ...pocketedIds.filter((id) => id !== CUE_BALL_ID)];
  const ownBefore = game.players[shooter].group;
  const firstGroup =
    pocketedObjectBalls[0] === undefined ? null : ballGroup(pocketedObjectBalls[0]);
  const assigned =
    ownBefore === null && firstGroup !== null && !scratched
      ? assignGroups(game.players, shooter, firstGroup)
      : game.players;
  const own = assigned[shooter].group;
  const players = withScores(assigned, table);
  const clearedBeforeShot =
    ownBefore !== null && groupBalls(ownBefore).every((id) => isPocketed(game.table, id));

  if (pocketedIds.includes(EIGHT_BALL_ID)) {
    // Sinking the 8 on the break wins outright, as in 8 Ball Pool.
    const legal = !scratched && (clearedBeforeShot || breaking);

    return {
      table,
      players,
      currentPlayer: shooter,
      phase: 'finished',
      winner: legal ? shooter : other(shooter),
      lastOutcome: legal ? 'eight-ball-win' : 'eight-ball-loss',
      pocketedBalls,
      ballInHand: false,
      trapPlaced: false,
    };
  }

  // Judged by the group held before the shot: on an open table any ball but the 8 is fine, and
  // on the break even the 8 is.
  const legalContact =
    firstContact !== null &&
    (breaking ||
      (firstContact === EIGHT_BALL_ID
        ? clearedBeforeShot
        : ownBefore === null || ballGroup(firstContact) === ownBefore));
  const pocketedOwn =
    pocketedObjectBalls.length > 0 &&
    (own === null || pocketedObjectBalls.some((id) => ballGroup(id) === own));
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
    ballInHand: FOULS.includes(outcome),
    trapPlaced: false,
  };
}

// The shot clock ran out: the turn passes and traps age as if a shot had been taken.
export function forfeitTurn(game: GameState): GameState {
  if (game.phase !== 'aiming') {
    return game;
  }

  return {
    ...game,
    table: ageTraps(game.table),
    currentPlayer: other(game.currentPlayer),
    lastOutcome: 'timeout',
    ballInHand: true,
    trapPlaced: false,
  };
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
