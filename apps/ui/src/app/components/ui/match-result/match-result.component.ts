import { Component, computed, input, output } from '@angular/core';
import { Button } from '../button/button.component';

const CONFETTI_COUNT = 24;
const CONFETTI_COLORS = ['#f2c14e', '#3fbf6e', '#3d7eff', '#ff5a5a', '#9b5de5', '#ff9b3d'];

interface Confetti {
  readonly left: number;
  readonly delay: number;
  readonly duration: number;
  readonly color: string;
  readonly drift: number;
}

// Full-board overlay once a game is over: who won, and a way to rack again.
@Component({
  imports: [Button],
  selector: 'dp-match-result',
  template: `
    @if (celebrate()) {
      @for (piece of confetti; track $index) {
        <span
          class="confetti"
          [style.left.%]="piece.left"
          [style.background]="piece.color"
          [style.animation-delay.ms]="piece.delay"
          [style.animation-duration.ms]="piece.duration"
          [style.--drift.px]="piece.drift"
        ></span>
      }
    }
    <div class="card" [class.card--lost]="!celebrate()">
      <span class="eyebrow">{{ celebrate() ? 'Victory' : 'Game over' }}</span>
      <h2 class="headline">{{ headline() }}</h2>
      <p class="detail">{{ detail() }}</p>
      <dp-button variant="primary" (click)="restart.emit()">Play again</dp-button>
    </div>
  `,
  styleUrl: './match-result.component.scss',
})
export class MatchResult {
  readonly winnerName = input.required<string>();
  // True when the viewer is the winner, or in hotseat where everyone shares the win.
  readonly celebrate = input(true);
  readonly detail = input('');
  readonly restart = output();

  protected readonly headline = computed(() => `${this.winnerName()} wins`);
  protected readonly confetti: readonly Confetti[] = Array.from(
    { length: CONFETTI_COUNT },
    (_, index) => ({
      left: (index / CONFETTI_COUNT) * 100 + Math.random() * 4,
      delay: Math.random() * 1200,
      duration: 2400 + Math.random() * 1600,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? '#ffffff',
      drift: (Math.random() - 0.5) * 120,
    }),
  );
}
