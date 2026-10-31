import { InjectionToken } from '@angular/core';

export type FrameCallback = (timestampMs: number) => void;

export interface FrameScheduler {
  request(callback: FrameCallback): void;
}

export const FRAME_SCHEDULER = new InjectionToken<FrameScheduler>('FRAME_SCHEDULER', {
  providedIn: 'root',
  factory: () => ({ request: (callback) => requestAnimationFrame(callback) }),
});
