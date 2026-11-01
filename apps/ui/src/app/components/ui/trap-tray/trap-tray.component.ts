import { Component, input, model, output } from '@angular/core';
import type { TrapKind } from '@dirtypool/contracts';

const LABELS: Readonly<Record<TrapKind, string>> = {
  bumper: 'Bumper: balls bounce off it',
  wall: 'Wall: blocks the way, press R to turn it',
  well: 'Gravity well: pulls slow balls in',
  hole: 'Black hole: swallows what reaches the middle',
};

// The pouch: pick a trap here, then tap the cloth to drop it. Picking again puts it back.
@Component({
  selector: 'dp-trap-tray',
  template: `
    @for (kind of kinds; track kind) {
      <button
        type="button"
        class="trap"
        [class.trap--selected]="selected() === kind"
        [disabled]="disabled() || trapsLeft() === 0"
        [attr.aria-pressed]="selected() === kind"
        [attr.aria-label]="labels[kind]"
        [title]="labels[kind]"
        (click)="toggle(kind)"
      >
        <span class="icon" [class]="'icon icon--' + kind"></span>
      </button>
    }
    @if (selected() === 'wall') {
      <button
        type="button"
        class="trap trap--rotate"
        aria-label="Turn the wall"
        title="Turn the wall (R)"
        (click)="rotate.emit()"
      >
        &#8635;
      </button>
    }
    <span class="count" [class.count--empty]="trapsLeft() === 0">{{ trapsLeft() }}</span>
  `,
  styleUrl: './trap-tray.component.scss',
})
export class TrapTray {
  readonly trapsLeft = input.required<number>();
  readonly disabled = input(false);
  readonly selected = model<TrapKind | null>(null);
  readonly rotate = output();

  protected readonly kinds: readonly TrapKind[] = ['bumper', 'wall', 'well', 'hole'];
  protected readonly labels = LABELS;

  protected toggle(kind: TrapKind): void {
    this.selected.set(this.selected() === kind ? null : kind);
  }
}
