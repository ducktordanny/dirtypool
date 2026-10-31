import { InjectionToken } from '@angular/core';

// Runs a callback after a delay and returns a cancel function; tests fire it by hand.
export interface TimerScheduler {
  schedule(callback: () => void, delayMs: number): () => void;
}

export const TIMER_SCHEDULER = new InjectionToken<TimerScheduler>('TIMER_SCHEDULER', {
  providedIn: 'root',
  factory: () => ({
    schedule: (callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);

      return () => clearTimeout(timer);
    },
  }),
});
