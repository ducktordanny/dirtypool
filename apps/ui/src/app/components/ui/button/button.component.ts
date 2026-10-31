import { Component, input } from '@angular/core';

@Component({
  selector: 'dp-button',
  template: `
    <button
      class="button"
      [class.button--primary]="variant() === 'primary'"
      [type]="type()"
      [disabled]="disabled()"
    >
      <ng-content />
    </button>
  `,
  styleUrl: './button.component.scss',
})
export class Button {
  readonly variant = input<'primary' | 'secondary'>('secondary');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
}
