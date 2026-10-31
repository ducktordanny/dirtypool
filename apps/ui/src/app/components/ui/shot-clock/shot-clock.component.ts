import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FRAME_SCHEDULER } from '../../../types/frame-scheduler.type';
import type { ShotClock } from '../../../types/shot-clock.type';

// Countdown bar for the player on turn. Null hides it.
@Component({
  selector: 'dp-shot-clock',
  template: `
    @if (clock() !== null) {
      <span class="bar" [style.transform]="'scaleX(' + fraction() + ')'"></span>
      <span class="seconds">{{ seconds() }}</span>
    }
  `,
  styleUrl: './shot-clock.component.scss',
  host: {
    '[class.clock--urgent]': 'urgent()',
    '[class.clock--hidden]': 'clock() === null',
    '[class.clock--mirrored]': 'mirrored()',
  },
})
export class ShotClockDisplay {
  readonly clock = input<ShotClock | null>(null);
  // Mirrored clocks sit on a right-aligned panel: seconds on the left, bar draining rightwards.
  readonly mirrored = input(false);

  protected readonly remainingMs = computed(() => {
    const clock = this.clock();

    return clock === null ? 0 : Math.max(0, clock.deadline - this.now());
  });
  protected readonly fraction = computed(() => {
    const clock = this.clock();

    return clock === null ? 0 : this.remainingMs() / clock.durationMs;
  });
  protected readonly seconds = computed(() => Math.ceil(this.remainingMs() / 1000));
  protected readonly urgent = computed(() => this.clock() !== null && this.remainingMs() < 5000);

  private readonly frames = inject(FRAME_SCHEDULER);
  private readonly now = signal(performance.now());
  private running = false;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });

    effect(() => {
      const clock = this.clock();

      untracked(() => {
        if (clock !== null && !this.running) {
          this.running = true;
          this.frames.request((timestamp) => this.tick(timestamp));
        }
      });
    });
  }

  private tick(timestamp: number): void {
    if (this.destroyed || this.clock() === null) {
      this.running = false;
      return;
    }

    this.now.set(timestamp);
    this.frames.request((next) => this.tick(next));
  }
}
