import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ServerMessage } from '@dirtypool/contracts';
import { RoomStore, SEAT_RESERVATION_MS } from './room-store.js';

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

test('a trap goes down on your own turn only, once per shot, and ages with the shot', () => {
  const store = new RoomStore({ random: () => 0, schedule: () => () => undefined });
  const { room, player: host } = store.create(() => undefined, 'Host');

  assert.equal(
    store.placeTrap(room, host, { kind: 'bumper', position: { x: 0.5, y: 0.3 } }),
    'not-your-turn',
  );

  const guest = store.join(room.code, () => undefined, 'Guest');

  assert.equal(guest.kind, 'joined');

  if (guest.kind !== 'joined') {
    return;
  }

  assert.equal(
    store.placeTrap(room, guest.player, { kind: 'bumper', position: { x: 0.5, y: 0.3 } }),
    'not-your-turn',
  );
  assert.equal(
    store.placeTrap(room, host, { kind: 'bumper', position: { x: 0.03, y: 0.3 } }),
    'blocked',
  );
  assert.equal(
    store.placeTrap(room, host, { kind: 'bumper', position: { x: 0.5, y: 0.3 } }),
    'placed',
  );
  assert.equal(
    store.placeTrap(room, host, { kind: 'well', position: { x: 1, y: 0.8 } }),
    'already-placed',
  );
  assert.equal(
    store.placeTrap(room, host, { kind: 'wall', position: { x: 1, y: 0.8 } }),
    'already-placed',
  );
  assert.equal(room.game.players[0].trapsLeft, 3);
  assert.equal(room.game.table.traps.length, 1);

  store.shoot(room, host, { direction: { x: 1, y: 0 }, power: 0.3 });

  assert.equal(room.game.table.traps[0]?.shotsLeft, 2);
  assert.equal(room.game.trapPlaced, false);

  room.game = { ...room.game, currentPlayer: 0 };

  assert.equal(
    store.placeTrap(room, host, { kind: 'wall', position: { x: 1, y: 0.8 } }),
    'blocked',
  );
  assert.equal(
    store.placeTrap(room, host, {
      kind: 'wall',
      position: { x: 1, y: 0.8 },
      direction: { x: 0, y: 1 },
    }),
    'placed',
  );
  assert.deepEqual(room.game.table.traps[1]?.direction, { x: 0, y: 1 });
});

test('a coin toss decides who breaks once both seats are filled, and again on a rematch', () => {
  const store = new RoomStore({ random: () => 0.9, schedule: () => () => undefined });
  const { room } = store.create(() => undefined, 'Host');

  assert.equal(room.game.currentPlayer, 0);

  store.join(room.code, () => undefined, 'Guest');

  assert.equal(room.game.currentPlayer, 1);

  room.game = { ...room.game, phase: 'finished', winner: 1 };
  store.restart(room);

  assert.equal(room.game.currentPlayer, 1);
});

test('private rooms stay out of the open list but can still be joined by code', () => {
  const store = new RoomStore({ random: () => 0, schedule: () => () => undefined });
  const { room } = store.create(() => undefined, 'Host', true);

  assert.deepEqual(store.openRooms(), []);
  assert.equal(store.join(room.code, () => undefined, 'Guest').kind, 'joined');
});

test('a detached seat is reserved, rejoinable by token, and freed when the reservation ends', () => {
  const timers: { callback: () => void; delayMs: number }[] = [];
  const store = new RoomStore({
    random: () => 0,
    schedule: (callback, delayMs) => {
      const entry = { callback, delayMs };

      timers.push(entry);

      return () => {
        const index = timers.indexOf(entry);

        if (index !== -1) {
          timers.splice(index, 1);
        }
      };
    },
  });
  const { room, player: host } = store.create(() => undefined, 'Host');
  const guest = store.join(room.code, () => undefined, 'Guest');

  assert.equal(guest.kind, 'joined');

  if (guest.kind !== 'joined') {
    return;
  }

  store.detach(room, guest.player);

  assert.deepEqual(store.roster(room)[1], { name: 'Guest', connected: false });
  assert.equal(store.join(room.code, () => undefined, 'Other').kind, 'full');
  assert.equal(
    store.rejoin(room.code, 'wrong-token-wrong-token', () => undefined).kind,
    'not-found',
  );

  const received: ServerMessage[] = [];
  const back = store.rejoin(room.code, guest.player.token, (message) => received.push(message));

  assert.equal(back.kind === 'joined' && back.player, guest.player);
  assert.deepEqual(store.roster(room)[1], { name: 'Guest', connected: true });

  store.detach(room, guest.player);

  const reservation = timers.find((timer) => timer.delayMs === SEAT_RESERVATION_MS);

  assert.notEqual(reservation, undefined);
  reservation?.callback();

  assert.equal(store.roster(room)[1], null);
  assert.equal(store.join(room.code, () => undefined, 'Other').kind, 'joined');
  assert.equal(host.connected, true);
});
