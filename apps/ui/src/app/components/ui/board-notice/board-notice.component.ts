import { Component, input } from '@angular/core';

// A dimmed overlay with a card over the board, for states where play cannot continue.
@Component({
  selector: 'dp-board-notice',
  template: `
    <div class="card">
      <h2 class="title">{{ title() }}</h2>
      @if (text(); as text) {
        <p class="text">{{ text }}</p>
      }
      <div class="actions">
        <ng-content />
      </div>
    </div>
  `,
  styleUrl: './board-notice.component.scss',
})
export class BoardNotice {
  readonly title = input.required<string>();
  readonly text = input('');
}
