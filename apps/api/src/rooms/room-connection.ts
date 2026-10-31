import { clientMessageSchema, type ClientMessage, type Shot } from '@dirtypool/contracts';
import type { Room, RoomPlayer, RoomStore, SendMessage } from './room-store.js';

// One instance per websocket. Parses untrusted client messages and drives the room store.
export class RoomConnection {
  private membership: { readonly room: Room; readonly player: RoomPlayer } | null = null;

  constructor(
    private readonly rooms: RoomStore,
    private readonly send: SendMessage,
  ) {}

  receive(raw: string): void {
    let json: unknown;

    try {
      json = JSON.parse(raw);
    } catch {
      this.send({ type: 'error', message: 'Message is not valid JSON' });
      return;
    }

    const parsed = clientMessageSchema.safeParse(json);

    if (!parsed.success) {
      this.send({ type: 'error', message: 'Unknown message' });
      return;
    }

    this.handle(parsed.data);
  }

  close(): void {
    if (this.membership === null) {
      return;
    }

    const { room, player } = this.membership;

    this.rooms.leave(room, player);
    this.rooms.broadcast(room, {
      type: 'roster',
      roster: this.rooms.roster(room),
      clock: this.rooms.clock(room),
    });
    this.membership = null;
  }

  private handle(message: ClientMessage): void {
    switch (message.type) {
      case 'create-room':
        this.enter(this.rooms.create(this.send, message.name));
        return;
      case 'join-room': {
        const result = this.rooms.join(message.code, this.send, message.name);

        if (result.kind === 'joined') {
          this.enter(result);
          return;
        }

        this.send({
          type: 'error',
          message: result.kind === 'full' ? 'Room is full' : 'Room not found',
        });
        return;
      }
      case 'shoot':
        this.shoot(message.shot);
        return;
    }
  }

  private enter(membership: { readonly room: Room; readonly player: RoomPlayer }): void {
    if (this.membership !== null) {
      this.close();
    }

    this.membership = membership;

    const { room, player } = membership;

    const roster = this.rooms.roster(room);
    const clock = this.rooms.clock(room);

    this.send({
      type: 'room-joined',
      code: room.code,
      playerIndex: player.index,
      roster,
      game: room.game,
      clock,
    });
    this.rooms.broadcast(room, { type: 'roster', roster, clock }, player);
  }

  private shoot(shot: Shot): void {
    if (this.membership === null) {
      this.send({ type: 'error', message: 'Join a room first' });
      return;
    }

    const { room, player } = this.membership;
    const result = this.rooms.shoot(room, player, shot);

    if (result.kind !== 'played') {
      this.send({ type: 'error', message: SHOOT_ERRORS[result.kind] });
      return;
    }

    this.rooms.broadcast(room, {
      type: 'shot-played',
      playerIndex: player.index,
      shot,
      game: result.game,
      clock: this.rooms.clock(room),
    });
  }
}

const SHOOT_ERRORS = {
  'not-your-turn': 'It is not your turn',
  finished: 'The game is over',
  'waiting-for-opponent': 'Waiting for an opponent to join',
} as const;
