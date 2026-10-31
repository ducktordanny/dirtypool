import { TestBed } from '@angular/core/testing';
import { ManualFrameScheduler } from '../testing/manual-frame-scheduler';
import { ManualTimerScheduler } from '../testing/manual-timer-scheduler';
import { FRAME_SCHEDULER } from '../types/frame-scheduler.type';
import { TIMER_SCHEDULER } from '../types/timer-scheduler.type';
import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;
  let frames: ManualFrameScheduler;
  let timers: ManualTimerScheduler;

  beforeEach(() => {
    frames = new ManualFrameScheduler();
    timers = new ManualTimerScheduler();
    TestBed.configureTestingModule({
      providers: [
        { provide: FRAME_SCHEDULER, useValue: frames },
        { provide: TIMER_SCHEDULER, useValue: timers },
      ],
    });
    service = TestBed.inject(GameService);
  });

  it('starts with a racked table, player 1 to shoot and the clock running', () => {
    expect(service.game().currentPlayer).toBe(0);
    expect(service.canShoot()).toBe(true);
    expect(service.table().balls).toHaveLength(16);
    expect(service.clock()).not.toBeNull();
    expect(timers.pending).toHaveLength(1);
  });

  it('animates a shot frame by frame and resolves the rules once the balls stop', () => {
    service.shoot({ direction: { x: 1, y: 0.01 }, power: 0.8 });

    expect(service.animating()).toBe(true);
    expect(service.canShoot()).toBe(false);
    expect(service.clock()).toBeNull();

    frames.flush();

    expect(service.animating()).toBe(false);
    expect(service.game().lastOutcome).not.toBeNull();
    expect(service.table()).toEqual(service.game().table);
    expect(service.clock()).not.toBeNull();
  });

  it('ignores a second shot while the first one is still rolling', () => {
    service.shoot({ direction: { x: 1, y: 0 }, power: 0.5 });
    const rolling = service.table();

    service.shoot({ direction: { x: -1, y: 0 }, power: 1 });

    expect(service.table()).toBe(rolling);
  });

  it('passes the turn when the shot clock runs out', () => {
    timers.fire();

    expect(service.game().currentPlayer).toBe(1);
    expect(service.game().lastOutcome).toBe('timeout');
    expect(timers.pending).toHaveLength(1);
  });

  it('resets everything on a new game', () => {
    service.shoot({ direction: { x: 1, y: 0 }, power: 0.8 });
    frames.flush();

    service.newGame();

    expect(service.game().lastOutcome).toBeNull();
    expect(service.game().players).toEqual([
      { score: 0, group: null },
      { score: 0, group: null },
    ]);
    expect(timers.pending).toHaveLength(1);
  });
});
