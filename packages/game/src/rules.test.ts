import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameState, TableState, Trap } from '@dirtypool/contracts';
import type { TableEvent } from './physics.js';
import { SOLIDS, createGame, forfeitTurn, resolveShot } from './rules.js';
import { placeBallInHand } from './rack.js';
import { FOOT_SPOT, HEAD_SPOT, TRAPS_PER_PLAYER, TRAP_LIFETIME_SHOTS } from './table.const.js';
import { canPlaceTrap, placeTrap } from './traps.js';

test('the break keeps the table open: pots keep the turn, any first contact is fine', () => {
  const game = createGame();
  const table = withPocketed(game.table, [14]);

  const next = resolveShot(game, table, [contact(1), pocketed(14)]);

  assert.equal(next.currentPlayer, 0);
  assert.equal(next.lastOutcome, 'pocketed');
  assert.deepEqual(next.players, [
    { score: 0, group: null, trapsLeft: TRAPS_PER_PLAYER },
    { score: 0, group: null, trapsLeft: TRAPS_PER_PLAYER },
  ]);
  assert.deepEqual(next.pocketedBalls, [14]);
});

test('the first pocketed ball after the break assigns the groups and keeps the turn', () => {
  const game = afterBreak(createGame());
  const table = withPocketed(game.table, [3]);

  const next = resolveShot(game, table, [contact(3), pocketed(3)]);

  assert.equal(next.currentPlayer, 0);
  assert.deepEqual(next.players, [
    { score: 1, group: 'solids', trapsLeft: TRAPS_PER_PLAYER },
    { score: 0, group: 'stripes', trapsLeft: TRAPS_PER_PLAYER },
  ]);
  assert.equal(next.lastOutcome, 'pocketed');
  assert.deepEqual(next.pocketedBalls, [3]);
});

test('missing everything passes the turn', () => {
  const game = afterBreak(createGame());

  const next = resolveShot(game, game.table, [contact(1)]);

  assert.equal(next.currentPlayer, 1);
  assert.equal(next.lastOutcome, 'missed');
  assert.equal(next.players[0].group, null);
});

test('hitting the opponent group first passes the turn even when a ball drops', () => {
  const game = withGroups(createGame(), 'solids');
  const table = withPocketed(game.table, [2]);

  const next = resolveShot(game, table, [contact(9), pocketed(2)]);

  assert.equal(next.currentPlayer, 1);
  assert.equal(next.lastOutcome, 'wrong-ball');
  assert.equal(next.players[0].score, 1);
});

test('pocketing only an opponent ball passes the turn', () => {
  const game = withGroups(createGame(), 'solids');
  const table = withPocketed(game.table, [9]);

  const next = resolveShot(game, table, [contact(1), pocketed(9)]);

  assert.equal(next.currentPlayer, 1);
  assert.equal(next.lastOutcome, 'opponent-ball');
  assert.equal(next.players[1].score, 1);
});

test('a scratch passes the turn and puts the cue ball back on the head spot', () => {
  const game = createGame();
  const table = withPocketed(game.table, [0]);

  const next = resolveShot(game, table, [contact(1), pocketed(0)]);

  assert.equal(next.currentPlayer, 1);
  assert.equal(next.lastOutcome, 'scratch');
  assert.equal(next.table.balls[0]!.pocketed, false);
  assert.deepEqual(next.table.balls[0]!.position, HEAD_SPOT);
  assert.equal(next.ballInHand, true);
});

test('a clean shot takes ball in hand away again', () => {
  const game: GameState = { ...afterBreak(createGame()), ballInHand: true };

  const next = resolveShot(game, game.table, [contact(1)]);

  assert.equal(next.lastOutcome, 'missed');
  assert.equal(next.ballInHand, false);
});

test('ball in hand goes anywhere clear of balls, rails and pockets', () => {
  const table = createGame().table;

  assert.notEqual(placeBallInHand(table, { x: 0.5, y: 0.5 }), null);
  assert.equal(placeBallInHand(table, { x: 0.01, y: 0.5 }), null);
  assert.equal(placeBallInHand(table, { x: 0.04, y: 0.04 }), null);
  assert.equal(placeBallInHand(table, { x: FOOT_SPOT.x, y: FOOT_SPOT.y }), null);
  assert.deepEqual(placeBallInHand(table, { x: 0.5, y: 0.5 })?.balls[0]?.position, {
    x: 0.5,
    y: 0.5,
  });
});

test('sinking the 8 on the break wins outright', () => {
  const game = createGame();
  const table = withPocketed(game.table, [8]);

  const next = resolveShot(game, table, [contact(1), pocketed(8)]);

  assert.equal(next.phase, 'finished');
  assert.equal(next.winner, 0);
  assert.equal(next.lastOutcome, 'eight-ball-win');
});

test('sinking the 8 while own balls remain loses the game', () => {
  const game = afterBreak(createGame());
  const table = withPocketed(game.table, [8]);

  const next = resolveShot(game, table, [contact(8), pocketed(8)]);

  assert.equal(next.phase, 'finished');
  assert.equal(next.winner, 1);
  assert.equal(next.lastOutcome, 'eight-ball-loss');
});

test('sinking the 8 after clearing your group wins', () => {
  const cleared = withGroups(createGame(), 'solids');
  const game: GameState = { ...cleared, table: withPocketed(cleared.table, [...SOLIDS]) };
  const table = withPocketed(game.table, [8]);

  const next = resolveShot(game, table, [contact(8), pocketed(8)]);

  assert.equal(next.phase, 'finished');
  assert.equal(next.winner, 0);
  assert.equal(next.lastOutcome, 'eight-ball-win');
});

test('pocketed balls are recorded in order across shots', () => {
  const game = afterBreak(createGame());
  const first = resolveShot(game, withPocketed(game.table, [5]), [contact(5), pocketed(5)]);
  const second = resolveShot(first, withPocketed(first.table, [12]), [contact(1), pocketed(12)]);

  assert.deepEqual(second.pocketedBalls, [5, 12]);
});

test('running out the shot clock passes the turn', () => {
  const game = withGroups(createGame(), 'solids');

  const next = forfeitTurn(game);

  assert.equal(next.currentPlayer, 1);
  assert.equal(next.lastOutcome, 'timeout');
  assert.equal(next.ballInHand, true);
  assert.deepEqual(next.table, game.table);
  assert.equal(forfeitTurn({ ...game, phase: 'finished' }).phase, 'finished');
});

test('the player on turn drops one trap per shot from a limited pouch', () => {
  const game = createGame();
  const first = placeTrap(game, 'bumper', { x: 0.5, y: 0.3 });

  assert.equal(first.kind, 'placed');

  if (first.kind !== 'placed') {
    return;
  }

  assert.equal(first.game.players[0].trapsLeft, TRAPS_PER_PLAYER - 1);
  assert.equal(first.game.trapPlaced, true);
  assert.deepEqual(first.game.table.traps, [
    {
      id: 0,
      kind: 'bumper',
      owner: 0,
      position: { x: 0.5, y: 0.3 },
      shotsLeft: TRAP_LIFETIME_SHOTS,
    },
  ]);
  assert.equal(placeTrap(first.game, 'well', { x: 1, y: 0.8 }).kind, 'already-placed');

  const empty: GameState = {
    ...game,
    players: [{ ...game.players[0], trapsLeft: 0 }, game.players[1]],
  };

  assert.equal(placeTrap(empty, 'well', { x: 1, y: 0.8 }).kind, 'no-traps-left');
  assert.equal(
    placeTrap({ ...game, phase: 'finished' }, 'well', { x: 1, y: 0.8 }).kind,
    'not-aiming',
  );
});

test('traps need clear cloth away from balls, pockets and each other', () => {
  const table = createGame().table;
  const placed: TableState = { ...table, traps: [bumper(0, 0.5, 0.3)] };

  assert.equal(canPlaceTrap(table, 'bumper', { x: 0.5, y: 0.3 }), true);
  assert.equal(canPlaceTrap(table, 'bumper', { x: 0.03, y: 0.5 }), false);
  assert.equal(canPlaceTrap(table, 'bumper', { x: 0.1, y: 0.1 }), false);
  assert.equal(canPlaceTrap(table, 'well', { x: HEAD_SPOT.x + 0.05, y: HEAD_SPOT.y }), false);
  assert.equal(canPlaceTrap(placed, 'well', { x: 0.55, y: 0.3 }), false);
  assert.equal(canPlaceTrap(placed, 'well', { x: 0.7, y: 0.3 }), true);
  assert.equal(
    placeTrap({ ...createGame(), table: placed }, 'well', { x: 0.55, y: 0.3 }).kind,
    'blocked',
  );
  assert.equal(placeBallInHand(placed, { x: 0.52, y: 0.3 }), null);

  // A wall needs a direction and is checked along its whole length.
  assert.equal(canPlaceTrap(table, 'wall', { x: 1, y: 0.3 }), false);
  assert.equal(canPlaceTrap(table, 'wall', { x: 1, y: 0.3 }, { x: 1, y: 0 }), true);
  assert.equal(canPlaceTrap(placed, 'wall', { x: 0.57, y: 0.3 }, { x: 1, y: 0 }), false);
  assert.equal(canPlaceTrap(placed, 'wall', { x: 0.57, y: 0.3 }, { x: 0, y: 1 }), true);
  assert.equal(placeBallInHand({ ...table, traps: [wall(1, 1, 0.3)] }, { x: 1.07, y: 0.3 }), null);
});

test('a ball swallowed by a hole counts as pocketed', () => {
  const game = withGroups(createGame(), 'solids');
  const next = resolveShot(game, withPocketed(game.table, [0]), [
    contact(1),
    { kind: 'swallowed', trapId: 0, ballId: 0 },
  ]);

  assert.equal(next.lastOutcome, 'scratch');
  assert.equal(next.ballInHand, true);
});

test('traps age with every shot and timeout, then disappear', () => {
  const game = afterBreak(createGame());
  const placed = placeTrap(game, 'well', { x: 1, y: 0.3 });

  assert.equal(placed.kind, 'placed');

  if (placed.kind !== 'placed') {
    return;
  }

  const afterShot = resolveShot(placed.game, placed.game.table, [contact(1)]);

  assert.equal(afterShot.table.traps[0]?.shotsLeft, TRAP_LIFETIME_SHOTS - 1);
  assert.equal(afterShot.trapPlaced, false);

  const afterTimeout = forfeitTurn(afterShot);

  assert.equal(afterTimeout.table.traps[0]?.shotsLeft, TRAP_LIFETIME_SHOTS - 2);

  const gone = resolveShot(afterTimeout, afterTimeout.table, [contact(1)]);

  assert.deepEqual(gone.table.traps, []);
});

test('a finished game ignores further shots', () => {
  const finished: GameState = { ...createGame(), phase: 'finished', winner: 0 };

  assert.equal(resolveShot(finished, finished.table, []), finished);
});

// A game where the break has been taken and nothing else happened.
function afterBreak(game: GameState): GameState {
  return { ...game, lastOutcome: 'missed', currentPlayer: 0 };
}

function withGroups(game: GameState, firstPlayerGroup: 'solids' | 'stripes'): GameState {
  return {
    ...afterBreak(game),
    players: [
      { score: 0, group: firstPlayerGroup, trapsLeft: TRAPS_PER_PLAYER },
      {
        score: 0,
        group: firstPlayerGroup === 'solids' ? 'stripes' : 'solids',
        trapsLeft: TRAPS_PER_PLAYER,
      },
    ],
  };
}

function withPocketed(table: TableState, ids: readonly number[]): TableState {
  return {
    ...table,
    balls: table.balls.map((ball) => (ids.includes(ball.id) ? { ...ball, pocketed: true } : ball)),
  };
}

function bumper(id: number, x: number, y: number): Trap {
  return { id, kind: 'bumper', owner: 0, position: { x, y }, shotsLeft: TRAP_LIFETIME_SHOTS };
}

function wall(id: number, x: number, y: number): Trap {
  return { ...bumper(id, x, y), kind: 'wall', direction: { x: 1, y: 0 } };
}

function contact(ballId: number): TableEvent {
  return { kind: 'cue-contact', ballId };
}

function pocketed(ballId: number): TableEvent {
  return { kind: 'pocketed', ballId, pocketIndex: 0 };
}
