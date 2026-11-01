import {
  clientMessageSchema,
  type Aim,
  type ClientMessage,
  type Shot,
  type TrapKind,
  type Vec2,
} from '@dirtypool/contracts';
import type { JoinResult, Room, RoomPlayer, RoomStore, SendMessage } from './room-store.js';

interface Membership {
  readonly room: Room;
  readonly player: RoomPlayer;
}

// One instance per websocket. Parses untrusted client messages and drives the room store.
export class RoomConnection {
  private membership: Membership | null = null;

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

  // The socket dropped: the seat stays reserved so the player can rejoin with their token.
  close(): void {
    if (this.membership === null) {
      return;
    }

    const { room, player } = this.membership;

    this.rooms.detach(room, player);
    this.broadcastRoster(room);
    this.membership = null;
  }

  private handle(message: ClientMessage): void {
    switch (message.type) {
      case 'create-room':
        this.enter(this.rooms.create(this.send, message.name, message.private));
        return;
      case 'join-room':
        this.enterIfJoined(this.rooms.join(message.code, this.send, message.name));
        return;
      case 'rejoin-room':
        this.enterIfJoined(this.rooms.rejoin(message.code, message.token, this.send));
        return;
      case 'leave-room':
        this.leave();
        return;
      case 'aim':
        this.relayAim(message.aim);
        return;
      case 'place-cue':
        this.placeCue(message.position);
        return;
      case 'place-trap':
        this.placeTrap(message.kind, message.position);
        return;
      case 'shoot':
        this.shoot(message.shot);
        return;
      case 'restart':
        this.restart();
        return;
    }
  }

  private enterIfJoined(result: JoinResult): void {
    if (result.kind === 'joined') {
      this.enter(result);
      return;
    }

    this.send({
      type: 'error',
      message: result.kind === 'full' ? 'Room is full' : 'Room not found',
    });
  }

  private enter(membership: Membership): void {
    if (this.membership !== null && this.membership.room !== membership.room) {
      this.leave();
    }

    this.membership = membership;

    const { room, player } = membership;

    this.send({
      type: 'room-joined',
      code: room.code,
      playerIndex: player.index,
      token: player.token,
      roster: this.rooms.roster(room),
      game: room.game,
      clock: this.rooms.clock(room),
    });
    this.broadcastRoster(room, player);
  }

  // An explicit leave frees the seat immediately.
  private leave(): void {
    if (this.membership === null) {
      return;
    }

    const { room, player } = this.membership;

    this.rooms.leave(room, player);
    this.broadcastRoster(room);
    this.membership = null;
  }

  private broadcastRoster(room: Room, except?: RoomPlayer): void {
    this.rooms.broadcast(
      room,
      { type: 'roster', roster: this.rooms.roster(room), clock: this.rooms.clock(room) },
      except,
    );
  }

  // Only the player on turn has a cue to show; anything else is dropped silently.
  private relayAim(aim: Aim): void {
    if (this.membership === null) {
      return;
    }

    const { room, player } = this.membership;

    if (room.game.phase === 'aiming' && room.game.currentPlayer === player.index) {
      this.rooms.broadcast(room, { type: 'opponent-aim', aim }, player);
    }
  }

  private placeCue(position: Vec2): void {
    if (this.membership === null) {
      this.send({ type: 'error', message: 'Join a room first' });
      return;
    }

    const { room, player } = this.membership;
    const result = this.rooms.placeCue(room, player, position);

    if (result !== 'placed') {
      this.send({ type: 'error', message: PLACE_ERRORS[result] });
      return;
    }

    this.rooms.broadcast(room, { type: 'cue-placed', position });
  }

  private placeTrap(kind: TrapKind, position: Vec2): void {
    if (this.membership === null) {
      this.send({ type: 'error', message: 'Join a room first' });
      return;
    }

    const { room, player } = this.membership;
    const result = this.rooms.placeTrap(room, player, kind, position);

    if (result !== 'placed') {
      this.send({ type: 'error', message: TRAP_ERRORS[result] });
      return;
    }

    this.rooms.broadcast(room, { type: 'trap-placed', game: room.game });
  }

  private restart(): void {
    if (this.membership === null) {
      this.send({ type: 'error', message: 'Join a room first' });
      return;
    }

    const { room } = this.membership;

    if (!this.rooms.restart(room)) {
      this.send({ type: 'error', message: 'The game is still running' });
      return;
    }

    this.rooms.broadcast(room, {
      type: 'game-reset',
      game: room.game,
      clock: this.rooms.clock(room),
    });
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

const PLACE_ERRORS = {
  'not-your-turn': 'It is not your turn',
  'no-ball-in-hand': 'You do not have ball in hand',
  blocked: 'The cue ball cannot go there',
} as const;

const TRAP_ERRORS = {
  'not-your-turn': 'It is not your turn',
  'not-aiming': 'The game is over',
  'no-traps-left': 'Your pouch is empty',
  'already-placed': 'One trap per shot',
  blocked: 'The trap cannot go there',
} as const;

const SHOOT_ERRORS = {
  'not-your-turn': 'It is not your turn',
  finished: 'The game is over',
  'waiting-for-opponent': 'Waiting for an opponent to join',
} as const;
