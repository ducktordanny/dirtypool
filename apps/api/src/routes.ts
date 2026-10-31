import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from './app.js';
import { RoomConnection } from './rooms/room-connection.js';

export function registerRoutes(app: FastifyInstance, dependencies: AppDependencies): void {
  app.get('/ws', { websocket: true }, (socket) => {
    const connection = new RoomConnection(dependencies.rooms, (message) =>
      socket.send(JSON.stringify(message)),
    );

    socket.on('message', (raw) => connection.receive(raw.toString()));
    socket.on('close', () => connection.close());
  });
}
