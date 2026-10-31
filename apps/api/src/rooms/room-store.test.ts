import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ServerMessage } from '@dirtypool/contracts';
import { RoomStore } from './room-store.js';

test('creates a room with a four-letter code and seats the creator as player 0', () => {
  const store = new RoomStore({ random: () => 0 });

  const { room, player } = store.create(() => undefined, 'Host');

  assert.equal(room.code, 'AAAA');
  assert.equal(player.index, 0);
  assert.equal(room.game.phase, 'aiming');
});

test('a second player joins as player 1 and a third is refused', () => {
  const store = new RoomStore({ random: () => 0 });
  const { room } = store.create(() => undefined, 'Host');

  const joined = store.join(room.code, () => undefined, 'Guest');
  const refused = store.join(room.code, () => undefined, 'Guest');

  assert.equal(joined.kind, 'joined');
  assert.equal(joined.kind === 'joined' && joined.player.index, 1);
  assert.equal(refused.kind, 'full');
  assert.equal(store.join('ZZZZ', () => undefined, 'Guest').kind, 'not-found');
});

test('only the current player can shoot and the result is simulated server-side', () => {
  const store = new RoomStore({ random: () => 0 });
  const { room, player: host } = store.create(() => undefined, 'Host');
  const guest = store.join(room.code, () => undefined, 'Guest');
  const shot = { direction: { x: 1, y: 0 }, power: 0.8 };

  assert.equal(guest.kind, 'joined');

  if (guest.kind !== 'joined') {
    return;
  }

  assert.equal(store.shoot(room, guest.player, shot).kind, 'not-your-turn');

  const before = room.game.table;
  const played = store.shoot(room, host, shot);

  assert.equal(played.kind, 'played');
  assert.notDeepEqual(room.game.table, before);
  assert.notEqual(room.game.lastOutcome, null);
});

test('shooting alone is refused until an opponent joins', () => {
  const store = new RoomStore({ random: () => 0 });
  const { room, player } = store.create(() => undefined, 'Host');

  const result = store.shoot(room, player, { direction: { x: 1, y: 0 }, power: 0.5 });

  assert.equal(result.kind, 'waiting-for-opponent');
});

test('leaving removes the player and an empty room is forgotten', () => {
  const store = new RoomStore({ random: () => 0 });
  const received: ServerMessage[] = [];
  const { room, player } = store.create((message) => received.push(message));

  store.leave(room, player);

  assert.equal(store.join(room.code, () => undefined, 'Guest').kind, 'not-found');
});

test('the shot clock passes the turn when it runs out', () => {
  const timers: (() => void)[] = [];
  const received: ServerMessage[] = [];
  const store = new RoomStore({
    random: () => 0,
    now: () => 1000,
    schedule: (callback) => {
      timers.push(callback);

      return () => undefined;
    },
  });
  const { room } = store.create(() => undefined, 'Host');

  assert.equal(store.clock(room), null);

  store.join(room.code, (message) => received.push(message), 'Guest');

  assert.ok((store.clock(room) ?? 0) > 0);
  assert.equal(timers.length, 1);

  timers[0]!();

  assert.equal(room.game.currentPlayer, 1);
  assert.equal(room.game.lastOutcome, 'timeout');
  assert.equal(received[0]?.type, 'turn-passed');
  assert.equal(timers.length, 2);
});

test('a finished game can be restarted, a running one cannot', () => {
  const store = new RoomStore({ random: () => 0, schedule: () => () => undefined });
  const { room } = store.create(() => undefined, 'Host');

  store.join(room.code, () => undefined, 'Guest');

  assert.equal(store.restart(room), false);

  room.game = { ...room.game, phase: 'finished', winner: 0 };

  assert.equal(store.restart(room), true);
  assert.equal(room.game.phase, 'aiming');
  assert.equal(room.game.pocketedBalls.length, 0);
  assert.ok((store.clock(room) ?? 0) > 0);
});

test('ball in hand lets only the fouled-against player move the cue ball to a clear spot', () => {
  const store = new RoomStore({ random: () => 0, schedule: () => () => undefined });
  const { room, player: host } = store.create(() => undefined, 'Host');
  const guest = store.join(room.code, () => undefined, 'Guest');

  assert.equal(guest.kind, 'joined');

  if (guest.kind !== 'joined') {
    return;
  }

  assert.equal(store.placeCue(room, host, { x: 0.5, y: 0.5 }), 'no-ball-in-hand');

  room.game = { ...room.game, ballInHand: true };

  assert.equal(store.placeCue(room, guest.player, { x: 0.5, y: 0.5 }), 'not-your-turn');
  assert.equal(store.placeCue(room, host, { x: 0.005, y: 0.5 }), 'blocked');
  assert.equal(store.placeCue(room, host, { x: 0.5, y: 0.5 }), 'placed');
  assert.deepEqual(room.game.table.balls[0]?.position, { x: 0.5, y: 0.5 });
});

test('private rooms stay out of the open list but can still be joined by code', () => {
  const store = new RoomStore({ random: () => 0, schedule: () => () => undefined });
  const { room } = store.create(() => undefined, 'Host', true);

  assert.deepEqual(store.openRooms(), []);
  assert.equal(store.join(room.code, () => undefined, 'Guest').kind, 'joined');
});
