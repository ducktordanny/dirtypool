import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientMessageSchema } from './room.js';

test('accepts a shoot message with a unit direction and bounded power', () => {
  const result = clientMessageSchema.safeParse({
    type: 'shoot',
    shot: { direction: { x: 1, y: 0 }, power: 0.5 },
  });

  assert.equal(result.success, true);
});

test('rejects a shot with power outside 0..1', () => {
  const result = clientMessageSchema.safeParse({
    type: 'shoot',
    shot: { direction: { x: 1, y: 0 }, power: 1.5 },
  });

  assert.equal(result.success, false);
});

test('rejects a room code that is not four upper-case letters', () => {
  const result = clientMessageSchema.safeParse({ type: 'join-room', code: 'ab1' });

  assert.equal(result.success, false);
});
