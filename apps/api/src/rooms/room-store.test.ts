import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ServerMessage } from '@dirtypool/contracts';
import { RoomStore } from './room-store.js';

test('creates a room with a four-letter code and seats the creator as player 0', () => {
  const store = new RoomStore(() => 0);

  const { room, player } = store.create(() => undefined);

  assert.equal(room.code, 'AAAA');
  assert.equal(player.index, 0);
  assert.equal(room.game.phase, 'aiming');
});

test('a second player joins as player 1 and a third is refused', () => {
  const store = new RoomStore(() => 0);
  const { room } = store.create(() => undefined);

  const joined = store.join(room.code, () => undefined);
  const refused = store.join(room.code, () => undefined);

  assert.equal(joined.kind, 'joined');
  assert.equal(joined.kind === 'joined' && joined.player.index, 1);
  assert.equal(refused.kind, 'full');
  assert.equal(store.join('ZZZZ', () => undefined).kind, 'not-found');
});

test('only the current player can shoot and the result is simulated server-side', () => {
  const store = new RoomStore(() => 0);
  const { room, player: host } = store.create(() => undefined);
  const guest = store.join(room.code, () => undefined);
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
  const store = new RoomStore(() => 0);
  const { room, player } = store.create(() => undefined);

  const result = store.shoot(room, player, { direction: { x: 1, y: 0 }, power: 0.5 });

  assert.equal(result.kind, 'waiting-for-opponent');
});

test('leaving removes the player and an empty room is forgotten', () => {
  const store = new RoomStore(() => 0);
  const received: ServerMessage[] = [];
  const { room, player } = store.create((message) => received.push(message));

  store.leave(room, player);

  assert.equal(store.join(room.code, () => undefined).kind, 'not-found');
});
