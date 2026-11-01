import { Component, ElementRef, inject, signal } from '@angular/core';

// A small question mark whose projected content shows in a bubble on hover, focus or tap.
@Component({
  selector: 'dp-help-tip',
  template: `
    <button
      type="button"
      class="trigger"
      aria-label="How to play"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      ?
    </button>
    <div class="bubble" role="tooltip">
      <ng-content />
    </div>
  `,
  styleUrl: './help-tip.component.scss',
  host: {
    '[class.help--open]': 'open()',
    '(focusout)': 'open.set(false)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class HelpTip {
  protected readonly open = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // A tap anywhere else closes a bubble that was opened by tapping.
  protected onDocumentPointerDown(event: Event): void {
    if (
      this.open() &&
      event.target instanceof Node &&
      !this.host.nativeElement.contains(event.target)
    ) {
      this.open.set(false);
    }
  }
}
