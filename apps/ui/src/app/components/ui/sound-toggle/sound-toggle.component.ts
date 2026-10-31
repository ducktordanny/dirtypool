import { Component, input, output } from '@angular/core';

@Component({
  selector: 'dp-sound-toggle',
  template: `
    <button
      class="toggle"
      type="button"
      [attr.aria-label]="muted() ? 'Unmute sounds' : 'Mute sounds'"
      [attr.aria-pressed]="muted()"
      (click)="toggled.emit()"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path class="icon" d="M4 9v6h4l5 4V5L8 9H4z" />
        @if (muted()) {
          <path class="icon icon--line" d="M16 9l5 6M21 9l-5 6" />
        } @else {
          <path class="icon icon--line" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12" />
        }
      </svg>
    </button>
  `,
  styleUrl: './sound-toggle.component.scss',
})
export class SoundToggle {
  readonly muted = input(false);
  readonly toggled = output();
}
