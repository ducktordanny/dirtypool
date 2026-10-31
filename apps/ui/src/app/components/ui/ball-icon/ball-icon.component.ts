import { Component, computed, input } from '@angular/core';
import type { BallId } from '@dirtypool/contracts';
import { ballCssColor, isStripe } from '../../../config/table-render.const';

// A small CSS-only ball for HUD rows and trays. A null id renders an empty slot.
@Component({
  selector: 'dp-ball-icon',
  template: `
    @if (number() !== null) {
      <span class="number">{{ number() }}</span>
    }
  `,
  styleUrl: './ball-icon.component.scss',
  host: {
    '[style.--ball-size.px]': 'size()',
    '[style.--ball-color]': 'color()',
    '[class.ball--empty]': 'id() === null',
    '[class.ball--stripe]': 'stripe()',
    '[class.ball--dim]': 'dim()',
  },
})
export class BallIcon {
  readonly id = input.required<BallId | null>();
  readonly size = input(24);
  readonly dim = input(false);

  protected readonly color = computed(() => {
    const id = this.id();

    return id === null ? 'transparent' : ballCssColor(id);
  });
  protected readonly stripe = computed(() => {
    const id = this.id();

    return id !== null && isStripe(id);
  });
  protected readonly number = computed(() => {
    const id = this.id();

    return id === null || id === 0 ? null : id;
  });
}
