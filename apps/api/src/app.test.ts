import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serverMessageSchema, type ServerMessage } from '@dirtypool/contracts';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { RoomStore } from './rooms/room-store.js';

test('GET /health reports that the API is available', async (context) => {
  const app = buildApp({ appOrigin: 'http://localhost:4200', rooms: new RoomStore() });
  context.after(async () => app.close());

  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
});

test('two sockets can create and join a room and the host can shoot', async (context) => {
  const app = buildApp({ appOrigin: 'http://localhost:4200', rooms: new RoomStore() });
  context.after(async () => app.close());

  const url = await listen(app);
  const host = await SocketClient.connect(url);
  const guest = await SocketClient.connect(url);
  context.after(async () => Promise.all([host.close(), guest.close()]));

  host.send({ type: 'create-room', name: 'Host' });
  const joined = await host.next('room-joined');

  assert.equal(joined.type, 'room-joined');

  if (joined.type !== 'room-joined') {
    return;
  }

  guest.send({ type: 'join-room', code: joined.code, name: 'Guest' });
  const guestJoined = await guest.next('room-joined');

  assert.equal(guestJoined.type === 'room-joined' && guestJoined.playerIndex, 1);
  const roster = await host.next('roster');

  assert.equal(roster.type === 'roster' && roster.roster.join(','), 'Host,Guest');
  assert.ok(roster.type === 'roster' && roster.clock !== null && roster.clock > 0);

  host.send({ type: 'aim', aim: { direction: { x: 0, y: 1 }, power: 0.3 } });
  assert.deepEqual(await guest.next('opponent-aim'), {
    type: 'opponent-aim',
    aim: { direction: { x: 0, y: 1 }, power: 0.3 },
  });

  host.send({ type: 'shoot', shot: { direction: { x: 1, y: 0.01 }, power: 0.7 } });
  const [hostShot, guestShot] = await Promise.all([
    host.next('shot-played'),
    guest.next('shot-played'),
  ]);

  assert.deepEqual(hostShot, guestShot);
  assert.equal(hostShot.type === 'shot-played' && hostShot.playerIndex, 0);
});

test('malformed messages are answered with an error instead of closing the socket', async (context) => {
  const app = buildApp({ appOrigin: 'http://localhost:4200', rooms: new RoomStore() });
  context.after(async () => app.close());

  const socket = await SocketClient.connect(await listen(app));
  context.after(async () => socket.close());

  socket.sendRaw('not json');

  assert.deepEqual(await socket.next('error'), {
    type: 'error',
    message: 'Message is not valid JSON',
  });
});

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });

  const address = app.server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('Server has no TCP address');
  }

  return `ws://127.0.0.1:${address.port}/ws`;
}

// Buffers every incoming message so none is lost between awaits.
class SocketClient {
  static connect(url: string): Promise<SocketClient> {
    const socket = new WebSocket(url);

    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(new SocketClient(socket)));
      socket.once('error', reject);
    });
  }

  private readonly received: ServerMessage[] = [];
  private waiter: (() => void) | null = null;

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (raw) => {
      this.received.push(serverMessageSchema.parse(JSON.parse(raw.toString())));
      this.waiter?.();
    });
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(raw: string): void {
    this.socket.send(raw);
  }

  async next(type: ServerMessage['type']): Promise<ServerMessage> {
    for (;;) {
      const index = this.received.findIndex((message) => message.type === type);

      if (index !== -1) {
        return this.received.splice(index, 1)[0] as ServerMessage;
      }

      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }
}
