import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { RoomStore } from './rooms/room-store.js';
import { readServerEnvironment } from './server-environment.js';

loadLocalEnvironment();

const environment = readServerEnvironment(process.env);
const production = process.env['NODE_ENV'] === 'production';
const app = buildApp(
  {
    appOrigin: environment.appOrigin,
    rooms: new RoomStore(),
    allowLocalOrigins: !production,
    ...(production
      ? { staticRoot: fileURLToPath(new URL('../../ui/dist/ui/browser', import.meta.url)) }
      : {}),
  },
  { logger: true },
);

process.once('SIGINT', () => void app.close());
process.once('SIGTERM', () => void app.close());

app.listen({ port: environment.port, host: '0.0.0.0' }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});

function loadLocalEnvironment(): void {
  try {
    loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
  } catch {
    // A missing .env is fine: defaults and real environment variables apply.
  }
}
