import { Component, input } from '@angular/core';
import type { BallId } from '@dirtypool/contracts';
import { BallIcon } from '../ui';

// The chute beside the table where pocketed balls collect, first one at the bottom.
@Component({
  imports: [BallIcon],
  selector: 'dp-ball-tray',
  template: `
    @for (ball of balls(); track ball) {
      <dp-ball-icon [id]="ball" [size]="24" />
    }
  `,
  styles: `
    $breakpoint: 640px;

    :host {
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      gap: var(--space-1);
      width: 32px;
      padding: var(--space-1) 0;
      border-radius: 16px;
      background: linear-gradient(to right, #0d0f12, #1b1e24 50%, #0d0f12);
      box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.8);
    }

    @media (max-width: $breakpoint) {
      :host {
        flex-direction: row;
        width: 100%;
        height: 32px;
        padding: 0 var(--space-1);
        background: linear-gradient(to bottom, #0d0f12, #1b1e24 50%, #0d0f12);
      }
    }
  `,
})
export class BallTray {
  readonly balls = input.required<readonly BallId[]>();
}
