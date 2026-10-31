import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import websocket from '@fastify/websocket';
import { apiErrorSchema, healthResponseSchema } from '@dirtypool/contracts';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { registerRoutes } from './routes.js';
import type { RoomStore } from './rooms/room-store.js';

export interface AppDependencies {
  readonly appOrigin: string;
  readonly rooms: RoomStore;
  readonly staticRoot?: string;
  // Development only: the UI dev server picks whatever port is free.
  readonly allowLocalOrigins?: boolean;
}

const LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u;

export function buildApp(
  dependencies: AppDependencies,
  options: FastifyServerOptions = {},
): FastifyInstance {
  const app = Fastify(options);

  void app.register(cors, {
    origin: (origin, callback) => {
      const allowed =
        origin === undefined ||
        origin === dependencies.appOrigin ||
        (dependencies.allowLocalOrigins === true && LOCAL_ORIGIN.test(origin));

      callback(null, allowed);
    },
  });
  void app.register(websocket);
  void app.register(async (instance) => {
    instance.get('/health', async () => healthResponseSchema.parse({ status: 'ok' }));
    registerRoutes(instance, dependencies);
  });

  if (dependencies.staticRoot !== undefined) {
    void app.register(staticFiles, { root: dependencies.staticRoot });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !/^\/(?:api|ws)(?:[/?]|$)/u.test(request.url) &&
        request.headers.accept?.includes('text/html')
      ) {
        return reply.sendFile('index.html');
      }

      return reply.code(404).send(apiErrorSchema.parse({ message: 'Not found' }));
    });
  }

  return app;
}
