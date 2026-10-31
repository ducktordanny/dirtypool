import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameState, TableState } from '@dirtypool/contracts';
import type { TableEvent } from './physics.js';
import { createGame, resolveShot } from './rules.js';
import { HEAD_SPOT } from './table.const.js';

test('pocketing an object ball scores and keeps the turn', () => {
  const game = createGame();
  const table = withPocketed(game.table, [3]);

  const next = resolveShot(game, table, [contact(3), pocketed(3)]);

  assert.equal(next.currentPlayer, 0);
  assert.deepEqual(next.players, [{ score: 1 }, { score: 0 }]);
  assert.equal(next.lastOutcome, 'pocketed');
});

test('missing everything passes the turn', () => {
  const game = createGame();

  const next = resolveShot(game, game.table, [contact(1)]);

  assert.equal(next.currentPlayer, 1);
  assert.equal(next.lastOutcome, 'missed');
});

test('a scratch passes the turn and puts the cue ball back on the head spot', () => {
  const game = createGame();
  const table = withPocketed(game.table, [0]);

  const next = resolveShot(game, table, [contact(1), pocketed(0)]);

  assert.equal(next.currentPlayer, 1);
  assert.equal(next.lastOutcome, 'scratch');
  assert.equal(next.table.balls[0]!.pocketed, false);
  assert.deepEqual(next.table.balls[0]!.position, HEAD_SPOT);
});

test('sinking the 8 while object balls remain loses the game', () => {
  const game = createGame();
  const table = withPocketed(game.table, [8]);

  const next = resolveShot(game, table, [contact(8), pocketed(8)]);

  assert.equal(next.phase, 'finished');
  assert.equal(next.winner, 1);
  assert.equal(next.lastOutcome, 'eight-ball-loss');
});

test('sinking the 8 last hands the win to the higher scorer', () => {
  const game: GameState = {
    ...createGame(),
    players: [{ score: 6 }, { score: 8 }],
    currentPlayer: 0,
  };
  const table = withPocketed(game.table, [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8]);

  const next = resolveShot(game, table, [contact(8), pocketed(8)]);

  assert.equal(next.phase, 'finished');
  assert.equal(next.winner, 1);
  assert.equal(next.lastOutcome, 'eight-ball-win');
});

test('a finished game ignores further shots', () => {
  const finished: GameState = { ...createGame(), phase: 'finished', winner: 0 };

  assert.equal(resolveShot(finished, finished.table, []), finished);
});

function withPocketed(table: TableState, ids: number[]): TableState {
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
