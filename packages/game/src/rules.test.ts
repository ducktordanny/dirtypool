import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameState, TableState } from '@dirtypool/contracts';
import type { TableEvent } from './physics.js';
import { SOLIDS, createGame, forfeitTurn, resolveShot } from './rules.js';
import { placeBallInHand } from './rack.js';
import { FOOT_SPOT, HEAD_SPOT } from './table.const.js';

test('the break keeps the table open: pots keep the turn, any first contact is fine', () => {
  const game = createGame();
  const table = withPocketed(game.table, [14]);

  const next = resolveShot(game, table, [contact(1), pocketed(14)]);

  assert.equal(next.currentPlayer, 0);
  assert.equal(next.lastOutcome, 'pocketed');
  assert.deepEqual(next.players, [
    { score: 0, group: null },
    { score: 0, group: null },
  ]);
  assert.deepEqual(next.pocketedBalls, [14]);
});

test('the first pocketed ball after the break assigns the groups and keeps the turn', () => {
  const game = afterBreak(createGame());
  const table = withPocketed(game.table, [3]);

  const next = resolveShot(game, table, [contact(3), pocketed(3)]);

  assert.equal(next.currentPlayer, 0);
  assert.deepEqual(next.players, [
    { score: 1, group: 'solids' },
    { score: 0, group: 'stripes' },
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
      { score: 0, group: firstPlayerGroup },
      { score: 0, group: firstPlayerGroup === 'solids' ? 'stripes' : 'solids' },
    ],
  };
}

function withPocketed(table: TableState, ids: readonly number[]): TableState {
  return {
    balls: table.balls.map((ball) => (ids.includes(ball.id) ? { ...ball, pocketed: true } : ball)),
  };
}

function contact(ballId: number): TableEvent {
  return { kind: 'cue-contact', ballId };
}

function pocketed(ballId: number): TableEvent {
  return { kind: 'pocketed', ballId, pocketIndex: 0 };
}
