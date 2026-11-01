import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readServerEnvironment } from './server-environment.js';

test('defaults the port and app origin for local development', () => {
  assert.deepEqual(readServerEnvironment({}), {
    port: 3001,
    appOrigin: 'http://localhost:4200',
  });
});

test('takes the app origin from the platform URL unless set explicitly', () => {
  const platform = { RENDER_EXTERNAL_URL: 'https://dirtypool.onrender.com' };

  assert.equal(readServerEnvironment(platform).appOrigin, 'https://dirtypool.onrender.com');
  assert.equal(
    readServerEnvironment({ ...platform, APP_ORIGIN: 'https://pool.example' }).appOrigin,
    'https://pool.example',
  );
});

test('rejects a non-numeric port', () => {
  assert.throws(() => readServerEnvironment({ PORT: 'abc' }), /PORT/u);
});
