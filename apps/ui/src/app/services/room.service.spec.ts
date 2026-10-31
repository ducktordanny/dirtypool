import { TestBed } from '@angular/core/testing';
import type { ServerMessage } from '@dirtypool/contracts';
import { createGame } from '@dirtypool/game';
import { ManualFrameScheduler } from '../testing/manual-frame-scheduler';
import { FRAME_SCHEDULER } from '../types/frame-scheduler.type';
import { ROOM_SOCKET_FACTORY, type RoomSocket } from '../types/room-socket.type';
import { RoomService } from './room.service';

class FakeSocket implements RoomSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly sent: unknown[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.(new Event('open'));
  }

  receive(message: ServerMessage): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

const SHOT = { direction: { x: 1, y: 0 }, power: 0.5 };

describe('RoomService', () => {
  let service: RoomService;
  let frames: ManualFrameScheduler;
  let socket: FakeSocket;

  beforeEach(() => {
    frames = new ManualFrameScheduler();
    socket = new FakeSocket();
    TestBed.configureTestingModule({
      providers: [
        { provide: FRAME_SCHEDULER, useValue: frames },
        { provide: ROOM_SOCKET_FACTORY, useValue: () => socket },
      ],
    });
    service = TestBed.inject(RoomService);
  });

  async function joinAsGuest(): Promise<void> {
    const entry = service.joinRoom('ABCD', 'Guest');

    socket.open();
    socket.receive({
      type: 'room-joined',
      code: 'ABCD',
      playerIndex: 1,
      roster: ['Host', 'Guest'],
      game: createGame(),
      clock: 30_000,
    });
    await entry;
  }

  it('creates a room once the socket opens and resolves with the code', async () => {
    const entry = service.createRoom('Host');

    socket.open();
    expect(socket.sent).toEqual([{ type: 'create-room', name: 'Host' }]);

    socket.receive({
      type: 'room-joined',
      code: 'ABCD',
      playerIndex: 0,
      roster: ['Host', null],
      game: createGame(),
      clock: null,
    });

    await expect(entry).resolves.toBe('ABCD');
    expect(service.code()).toBe('ABCD');
    expect(service.playerIndex()).toBe(0);
    expect(service.playerCount()).toBe(1);
    expect(service.clock()).toBeNull();
    expect(service.canShoot()).toBe(false);
  });

  it('rejects joining a full room with the server message', async () => {
    const entry = service.joinRoom('abcd', 'Guest');

    socket.open();
    expect(socket.sent).toEqual([{ type: 'join-room', code: 'ABCD', name: 'Guest' }]);

    socket.receive({ type: 'error', message: 'Room is full' });

    await expect(entry).rejects.toThrow('Room is full');
    expect(service.error()).toBe('Room is full');
    expect(service.code()).toBeNull();
  });

  it('rejects a malformed code without opening a socket', async () => {
    await expect(service.joinRoom('ab', 'Guest')).rejects.toThrow('four letters');
    expect(socket.onopen).toBeNull();
  });

  it('starts the shot clock from the roster message when the opponent arrives', async () => {
    const entry = service.createRoom('Host');

    socket.open();
    socket.receive({
      type: 'room-joined',
      code: 'ABCD',
      playerIndex: 0,
      roster: ['Host', null],
      game: createGame(),
      clock: null,
    });
    await entry;

    socket.receive({ type: 'roster', roster: ['Host', 'Guest'], clock: 30_000 });

    expect(service.playerCount()).toBe(2);
    expect(service.roster()).toEqual(['Host', 'Guest']);
    expect(service.clock()?.durationMs).toBe(30_000);
    expect(service.canShoot()).toBe(true);
  });

  it('animates a broadcast shot locally and then adopts the server state', async () => {
    await joinAsGuest();

    const played = { ...createGame(), currentPlayer: 1 as const, lastOutcome: 'missed' as const };

    socket.receive({
      type: 'shot-played',
      playerIndex: 0,
      shot: SHOT,
      game: played,
      clock: 32_000,
    });

    expect(service.animating()).toBe(true);
    expect(service.canShoot()).toBe(false);

    frames.flush();

    expect(service.animating()).toBe(false);
    expect(service.game()).toEqual(played);
    expect(service.table()).toEqual(played.table);
    expect(service.canShoot()).toBe(true);
  });

  it('only sends a shot when it is this player turn', async () => {
    await joinAsGuest();

    service.shoot(SHOT);
    expect(socket.sent).toHaveLength(1);

    socket.receive({
      type: 'shot-played',
      playerIndex: 0,
      shot: SHOT,
      game: { ...createGame(), currentPlayer: 1 },
      clock: 32_000,
    });
    frames.flush();
    service.shoot(SHOT);

    expect(socket.sent[1]).toEqual({ type: 'shoot', shot: SHOT });
  });

  it('adopts a passed turn when the server clock runs out', async () => {
    await joinAsGuest();

    const passed = { ...createGame(), currentPlayer: 1 as const, lastOutcome: 'timeout' as const };

    socket.receive({ type: 'turn-passed', game: passed, clock: 30_000 });

    expect(service.game()).toEqual(passed);
    expect(service.canShoot()).toBe(true);
  });

  it('reports a lost connection and clears the room', async () => {
    const entry = service.createRoom('Host');

    socket.open();
    socket.receive({
      type: 'room-joined',
      code: 'ABCD',
      playerIndex: 0,
      roster: ['Host', null],
      game: createGame(),
      clock: null,
    });
    await entry;

    socket.onclose?.(new CloseEvent('close'));

    expect(service.connection()).toBe('closed');
    expect(service.code()).toBeNull();
    expect(service.error()).toBe('Connection lost');
  });
});
