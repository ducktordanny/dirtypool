import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readServerEnvironment } from './server-environment.js';

test('defaults the port and app origin for local development', () => {
  assert.deepEqual(readServerEnvironment({}), {
    port: 3001,
    appOrigin: 'http://localhost:4200',
  });
});

test('rejects a non-numeric port', () => {
  assert.throws(() => readServerEnvironment({ PORT: 'abc' }), /PORT/u);
});
