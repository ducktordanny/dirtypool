import { Component, ElementRef, computed, inject, input, model } from '@angular/core';
import type { Spin } from '@dirtypool/contracts';

const KEYBOARD_STEP = 0.1;
// The tip can be placed this far from the centre, as a fraction of the ball radius.
const MAX_OFFSET = 0.8;

// A cue ball to tap or drag on: where the tip lands sets side, top and back spin. Up is top spin.
@Component({
  selector: 'dp-spin-control',
  template: `
    <div class="ball">
      <span class="ball__cross"></span>
      <span class="tip" [style.left.%]="tipLeft()" [style.top.%]="tipTop()"></span>
    </div>
  `,
  styleUrl: './spin-control.component.scss',
  host: {
    role: 'group',
    tabindex: '0',
    'aria-label': 'Spin: drag the dot on the cue ball',
    '[class.spin--disabled]': 'disabled()',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerUp($event)',
    '(dblclick)': 'reset()',
    '(keydown)': 'onKeyDown($event)',
  },
})
export class SpinControl {
  readonly disabled = input(false);
  readonly spin = model<Spin>({ x: 0, y: 0 });

  protected readonly tipLeft = computed(() => 50 + this.spin().x * MAX_OFFSET * 50);
  protected readonly tipTop = computed(() => 50 - this.spin().y * MAX_OFFSET * 50);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pointerId: number | null = null;

  protected onPointerDown(event: PointerEvent): void {
    if (this.disabled()) {
      return;
    }

    event.preventDefault();
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    this.setFromPointer(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.pointerId === event.pointerId) {
      this.setFromPointer(event);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.pointerId === event.pointerId) {
      this.host.nativeElement.releasePointerCapture(event.pointerId);
      this.pointerId = null;
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.disabled()) {
      return;
    }

    const { x, y } = this.spin();
    const steps: Record<string, Spin> = {
      ArrowUp: { x, y: y + KEYBOARD_STEP },
      ArrowDown: { x, y: y - KEYBOARD_STEP },
      ArrowLeft: { x: x - KEYBOARD_STEP, y },
      ArrowRight: { x: x + KEYBOARD_STEP, y },
    };
    const next = steps[event.key];

    if (next === undefined) {
      return;
    }

    event.preventDefault();
    this.spin.set(clampToDisk(next));
  }

  protected reset(): void {
    if (!this.disabled()) {
      this.spin.set({ x: 0, y: 0 });
    }
  }

  private setFromPointer(event: PointerEvent): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const x = (event.clientX - rect.left - rect.width / 2) / (radius * MAX_OFFSET);
    const y = -(event.clientY - rect.top - rect.height / 2) / (radius * MAX_OFFSET);

    this.spin.set(clampToDisk({ x, y }));
  }
}

function clampToDisk(spin: Spin): Spin {
  const length = Math.hypot(spin.x, spin.y);

  return length <= 1 ? spin : { x: spin.x / length, y: spin.y / length };
}
