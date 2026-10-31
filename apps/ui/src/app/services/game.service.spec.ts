import { TestBed } from '@angular/core/testing';
import { GameService } from './game.service';
import { FRAME_SCHEDULER, type FrameCallback } from '../types/frame-scheduler.type';

class ManualFrameScheduler {
  private queue: FrameCallback[] = [];
  private now = 0;

  request(callback: FrameCallback): void {
    this.queue.push(callback);
  }

  // Drives frames at 60 Hz until nothing is scheduled.
  flush(): void {
    while (this.queue.length > 0) {
      const callbacks = this.queue;

      this.queue = [];
      this.now += 1000 / 60;
      callbacks.forEach((callback) => callback(this.now));
    }
  }
}

describe('GameService', () => {
  let service: GameService;
  let frames: ManualFrameScheduler;

  beforeEach(() => {
    frames = new ManualFrameScheduler();
    TestBed.configureTestingModule({ providers: [{ provide: FRAME_SCHEDULER, useValue: frames }] });
    service = TestBed.inject(GameService);
  });

  it('starts with a racked table and player 1 to shoot', () => {
    expect(service.game().currentPlayer).toBe(0);
    expect(service.canShoot()).toBe(true);
    expect(service.table().balls).toHaveLength(16);
  });

  it('animates a shot frame by frame and resolves the rules once the balls stop', () => {
    service.shoot({ direction: { x: 1, y: 0.01 }, power: 0.8 });

    expect(service.animating()).toBe(true);
    expect(service.canShoot()).toBe(false);

    frames.flush();

    expect(service.animating()).toBe(false);
    expect(service.game().lastOutcome).not.toBeNull();
    expect(service.table()).toEqual(service.game().table);
  });

  it('ignores a second shot while the first one is still rolling', () => {
    service.shoot({ direction: { x: 1, y: 0 }, power: 0.5 });
    const rolling = service.table();

    service.shoot({ direction: { x: -1, y: 0 }, power: 1 });

    expect(service.table()).toBe(rolling);
  });

  it('resets everything on a new game', () => {
    service.shoot({ direction: { x: 1, y: 0 }, power: 0.8 });
    frames.flush();

    service.newGame();

    expect(service.game().lastOutcome).toBeNull();
    expect(service.game().players).toEqual([{ score: 0 }, { score: 0 }]);
  });
});
