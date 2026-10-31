import type { TimerScheduler } from '../types/timer-scheduler.type';

// Collects scheduled timers so tests can fire or inspect them.
export class ManualTimerScheduler implements TimerScheduler {
  readonly pending: { callback: () => void; delayMs: number }[] = [];

  schedule(callback: () => void, delayMs: number): () => void {
    const entry = { callback, delayMs };

    this.pending.push(entry);

    return () => {
      const index = this.pending.indexOf(entry);

      if (index !== -1) {
        this.pending.splice(index, 1);
      }
    };
  }

  // Fires every pending timer once, in order.
  fire(): void {
    const due = this.pending.splice(0);

    due.forEach((entry) => entry.callback());
  }
}
