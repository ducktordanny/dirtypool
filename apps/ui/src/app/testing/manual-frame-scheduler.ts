import type { FrameCallback, FrameScheduler } from '../types/frame-scheduler.type';

// Drives animation frames by hand in tests.
export class ManualFrameScheduler implements FrameScheduler {
  private queue: FrameCallback[] = [];
  private now = 0;

  request(callback: FrameCallback): void {
    this.queue.push(callback);
  }

  // Runs frames at 60 Hz until nothing is scheduled.
  flush(): void {
    while (this.queue.length > 0) {
      const callbacks = this.queue;

      this.queue = [];
      this.now += 1000 / 60;
      callbacks.forEach((callback) => callback(this.now));
    }
  }
}
