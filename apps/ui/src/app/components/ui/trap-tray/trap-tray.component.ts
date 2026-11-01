import { Component, input, model, output } from '@angular/core';
import type { TrapKind } from '@dirtypool/contracts';

interface TrapInfo {
  readonly kind: TrapKind;
  readonly name: string;
  readonly description: string;
}

const TRAPS: readonly TrapInfo[] = [
  { kind: 'bumper', name: 'Bumper', description: 'Balls bounce off it' },
  { kind: 'spring', name: 'Spring', description: 'Throws balls back faster' },
  { kind: 'wall', name: 'Wall', description: 'Blocks the way' },
  { kind: 'fan', name: 'Fan', description: 'Blows balls along it' },
  { kind: 'well', name: 'Gravity well', description: 'Pulls every ball towards it' },
  { kind: 'magnet', name: 'Magnet', description: 'Pulls one group only' },
  { kind: 'hole', name: 'Black hole', description: 'Swallows what reaches the middle' },
  { kind: 'mud', name: 'Mud', description: 'Balls bog down in it' },
  { kind: 'ice', name: 'Ice', description: 'Balls slide, spin gets no grip' },
  { kind: 'plug', name: 'Plug', description: 'Drop it on a pocket to close it' },
  { kind: 'portal', name: 'Portal', description: 'In one mouth, out the other' },
];

// The pouch: pick a trap here, then tap the cloth to drop it. Picking again puts it back.
@Component({
  selector: 'dp-trap-tray',
  template: `
    <div class="head">
      <span class="title">Traps</span>
      <span class="count" [class.count--empty]="trapsLeft() === 0">{{ trapsLeft() }} left</span>
      <ng-content />
    </div>
    <ul class="list">
      @for (trap of traps; track trap.kind) {
        <li class="item">
          <button
            type="button"
            class="row"
            [class.row--selected]="selected() === trap.kind"
            [disabled]="disabled() || trapsLeft() === 0"
            [attr.aria-pressed]="selected() === trap.kind"
            (click)="toggle(trap.kind)"
          >
            <span class="icon" [class]="'icon icon--' + trap.kind"></span>
            <span class="text">
              <span class="name">{{ trap.name }}</span>
              <span class="description">{{ trap.description }}</span>
            </span>
          </button>
          @if (selected() === trap.kind && turnable()) {
            <button type="button" class="turn" [title]="turnLabel() + ' (R)'" (click)="turn.emit()">
              &#8635; {{ turnLabel() }}
            </button>
          }
        </li>
      }
    </ul>
  `,
  styleUrl: './trap-tray.component.scss',
})
export class TrapTray {
  readonly trapsLeft = input.required<number>();
  readonly disabled = input(false);
  // Whether the picked trap has something to turn: an angle, or the group a magnet pulls.
  readonly turnable = input(false);
  readonly turnLabel = input('Turn');
  readonly selected = model<TrapKind | null>(null);
  readonly turn = output();

  protected readonly traps = TRAPS;

  protected toggle(kind: TrapKind): void {
    this.selected.set(this.selected() === kind ? null : kind);
  }
}
