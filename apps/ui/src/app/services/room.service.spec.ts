import { TestBed } from '@angular/core/testing';
import type { ServerMessage } from '@dirtypool/contracts';
import { createGame } from '@dirtypool/game';
import { ManualFrameScheduler } from '../testing/manual-frame-scheduler';
import { ManualTimerScheduler } from '../testing/manual-timer-scheduler';
import { FRAME_SCHEDULER } from '../types/frame-scheduler.type';
import { TIMER_SCHEDULER } from '../types/timer-scheduler.type';
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
const SEATED_HOST = { name: 'Host', connected: true };
const SEATED_GUEST = { name: 'Guest', connected: true };

function aimsSent(socket: FakeSocket): unknown[] {
  return socket.sent.filter((message) => (message as { type: string }).type === 'aim');
}

describe('RoomService', () => {
  let service: RoomService;
  let frames: ManualFrameScheduler;
  let timers: ManualTimerScheduler;
  let socket: FakeSocket;

  beforeEach(() => {
    sessionStorage.clear();
    frames = new ManualFrameScheduler();
    timers = new ManualTimerScheduler();
    socket = new FakeSocket();
    TestBed.configureTestingModule({
      providers: [
        { provide: FRAME_SCHEDULER, useValue: frames },
        { provide: TIMER_SCHEDULER, useValue: timers },
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
      token: 'guest-token-guest-token',
      roster: [SEATED_HOST, SEATED_GUEST],
      game: createGame(),
      clock: 30_000,
    });
    await entry;
  }

  it('creates a room once the socket opens and resolves with the code', async () => {
    const entry = service.createRoom('Host', true);

    socket.open();
    expect(socket.sent).toEqual([{ type: 'create-room', name: 'Host', private: true }]);

    socket.receive({
      type: 'room-joined',
      code: 'ABCD',
      playerIndex: 0,
      token: 'host-token-host-token',
      roster: [SEATED_HOST, null],
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
      token: 'host-token-host-token',
      roster: [SEATED_HOST, null],
      game: createGame(),
      clock: null,
    });
    await entry;

    socket.receive({
      type: 'roster',
      roster: [SEATED_HOST, SEATED_GUEST],
      game: { ...createGame(), currentPlayer: 1 },
      clock: 30_000,
    });

    expect(service.playerCount()).toBe(2);
    expect(service.roster()).toEqual([SEATED_HOST, SEATED_GUEST]);
    expect(service.clock()?.durationMs).toBe(30_000);
    // The server tossed a coin for the break when the guest arrived: the guest breaks.
    expect(service.game()?.currentPlayer).toBe(1);
    expect(service.canShoot()).toBe(false);

    socket.receive({ type: 'turn-passed', game: createGame(), clock: 30_000 });

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
    expect(service.clock()).toBeNull();

    frames.flush();

    expect(service.animating()).toBe(false);
    expect(service.game()).toEqual(played);
    expect(service.table()).toEqual(played.table);
    expect(service.canShoot()).toBe(true);
    expect(service.clock()?.durationMs).toBe(30_000);
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

  it('shows the opponent cue while they aim and drops it the moment they shoot', async () => {
    await joinAsGuest();

    socket.receive({ type: 'opponent-aim', aim: { direction: { x: 0, y: 1 }, power: 0.4 } });

    expect(service.opponentAim()).toEqual({ direction: { x: 0, y: 1 }, power: 0.4 });

    socket.receive({
      type: 'shot-played',
      playerIndex: 0,
      shot: SHOT,
      game: { ...createGame(), currentPlayer: 1 },
      clock: 32_000,
    });

    expect(service.animating()).toBe(true);
    expect(service.opponentAim()).toBeNull();

    socket.receive({ type: 'opponent-aim', aim: { direction: { x: 1, y: 0 }, power: 0.1 } });

    expect(service.opponentAim()).toBeNull();

    frames.flush();

    expect(service.opponentAim()).toBeNull();
  });

  it('throttles outgoing aim updates and sends the latest one on its turn', async () => {
    await joinAsGuest();
    socket.receive({
      type: 'turn-passed',
      game: { ...createGame(), currentPlayer: 1, lastOutcome: 'timeout' },
      clock: 30_000,
    });

    service.sendAim({ direction: { x: 1, y: 0 }, power: 0 });
    service.sendAim({ direction: { x: 0, y: 1 }, power: 0.2 });
    service.sendAim({ direction: { x: 0, y: -1 }, power: 0.5 });

    expect(aimsSent(socket)).toHaveLength(1);
    expect(timers.pending).toHaveLength(1);

    timers.fire();

    expect(aimsSent(socket)).toEqual([
      { type: 'aim', aim: { direction: { x: 1, y: 0 }, power: 0 } },
      { type: 'aim', aim: { direction: { x: 0, y: -1 }, power: 0.5 } },
    ]);
  });

  it('does not send aim when it is not this player turn', async () => {
    await joinAsGuest();

    service.sendAim({ direction: { x: 1, y: 0 }, power: 0.3 });

    expect(aimsSent(socket)).toHaveLength(0);
  });

  it('announces each shot outcome and clears it on a reset', async () => {
    await joinAsGuest();

    expect(service.lastShot()).toBeNull();

    socket.receive({
      type: 'shot-played',
      playerIndex: 0,
      shot: SHOT,
      game: { ...createGame(), currentPlayer: 1, lastOutcome: 'scratch' },
      clock: 32_000,
    });
    frames.flush();

    expect(service.lastShot()).toEqual({ seq: 1, outcome: 'scratch' });

    socket.receive({ type: 'game-reset', game: createGame(), clock: 30_000 });

    expect(service.lastShot()).toBeNull();
    expect(service.game()?.lastOutcome).toBeNull();
  });

  it('asks for a rematch only once the game is over', async () => {
    await joinAsGuest();

    service.restart();
    expect(
      socket.sent.filter((message) => (message as { type: string }).type === 'restart'),
    ).toHaveLength(0);

    socket.receive({
      type: 'turn-passed',
      game: { ...createGame(), phase: 'finished', winner: 0, lastOutcome: 'eight-ball-win' },
      clock: null,
    });
    service.restart();

    expect(socket.sent.at(-1)).toEqual({ type: 'restart' });
  });

  it('remembers who the opponent was after they leave', async () => {
    await joinAsGuest();

    expect(service.opponentName()).toBe('Host');

    socket.receive({
      type: 'roster',
      roster: [null, SEATED_GUEST],
      game: createGame(),
      clock: null,
    });

    expect(service.opponentName()).toBeNull();
    expect(service.lastOpponentName()).toBe('Host');
    expect(service.playerCount()).toBe(1);
    expect(service.clock()).toBeNull();
    expect(service.canShoot()).toBe(false);
  });

  it('sends a cue placement with ball in hand and applies the confirmed spot', async () => {
    await joinAsGuest();
    socket.receive({
      type: 'turn-passed',
      game: { ...createGame(), currentPlayer: 1, lastOutcome: 'timeout', ballInHand: true },
      clock: 30_000,
    });

    service.moveCueBall({ x: 0.5, y: 0.5 });
    expect(service.table()?.balls[0]?.position).toEqual({ x: 0.5, y: 0.5 });

    service.placeCueBall({ x: 0.005, y: 0.5 });
    expect(service.table()).toEqual(service.game()?.table);

    service.placeCueBall({ x: 0.5, y: 0.5 });
    expect(socket.sent.at(-1)).toEqual({ type: 'place-cue', position: { x: 0.5, y: 0.5 } });

    socket.receive({ type: 'cue-placed', position: { x: 0.5, y: 0.5 } });
    expect(service.game()?.table.balls[0]?.position).toEqual({ x: 0.5, y: 0.5 });
  });

  it('keeps the room and rejoins the same seat after the socket drops', async () => {
    await joinAsGuest();

    const dropped = socket;

    socket = new FakeSocket();
    dropped.onclose?.(new CloseEvent('close'));

    expect(service.connection()).toBe('reconnecting');
    expect(service.code()).toBe('ABCD');
    expect(service.game()).not.toBeNull();
    expect(service.canShoot()).toBe(false);
    expect(timers.pending).toHaveLength(1);

    timers.fire();
    socket.open();

    expect(socket.sent).toEqual([
      { type: 'rejoin-room', code: 'ABCD', token: 'guest-token-guest-token' },
    ]);

    socket.receive({
      type: 'room-joined',
      code: 'ABCD',
      playerIndex: 1,
      token: 'guest-token-guest-token',
      roster: [SEATED_HOST, SEATED_GUEST],
      game: { ...createGame(), currentPlayer: 1, lastOutcome: 'missed' },
      clock: 20_000,
    });

    expect(service.connection()).toBe('open');
    expect(service.canShoot()).toBe(true);
  });

  it('resumes a seat remembered for the code and falls back to joining on a stale token', async () => {
    sessionStorage.setItem(
      'dirtypool.seat',
      JSON.stringify({ code: 'ABCD', token: 'old-token-old-token-old' }),
    );

    const entry = service.joinRoom('ABCD', 'Guest');

    socket.open();
    expect(socket.sent).toEqual([
      { type: 'rejoin-room', code: 'ABCD', token: 'old-token-old-token-old' },
    ]);

    socket.receive({ type: 'error', message: 'Room not found' });

    expect(socket.sent[1]).toEqual({ type: 'join-room', code: 'ABCD', name: 'Guest' });

    socket.receive({
      type: 'room-joined',
      code: 'ABCD',
      playerIndex: 1,
      token: 'new-token-new-token-new',
      roster: [SEATED_HOST, SEATED_GUEST],
      game: createGame(),
      clock: 30_000,
    });

    await expect(entry).resolves.toBe('ABCD');
    expect(JSON.parse(sessionStorage.getItem('dirtypool.seat') ?? 'null')).toEqual({
      code: 'ABCD',
      token: 'new-token-new-token-new',
    });
  });

  it('leaving gives the seat up and forgets it', async () => {
    await joinAsGuest();

    service.leave();

    expect(socket.sent.at(-1)).toEqual({ type: 'leave-room' });
    expect(socket.closed).toBe(true);
    expect(service.code()).toBeNull();
    expect(sessionStorage.getItem('dirtypool.seat')).toBeNull();
  });
});
