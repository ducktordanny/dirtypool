import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { MIN_SHOT_POWER } from '../../../config/table-render.const';

const KEYBOARD_STEP = 0.05;

// Pull the handle away from the start of the track to charge a shot; releasing fires it.
@Component({
  selector: 'dp-power-slider',
  template: `
    <div class="track">
      <div class="fill"></div>
      <div class="handle">
        <span class="handle__cue"></span>
      </div>
    </div>
  `,
  styleUrl: './power-slider.component.scss',
  host: {
    role: 'slider',
    tabindex: '0',
    'aria-label': 'Shot power',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'percent()',
    '[attr.aria-disabled]': 'disabled()',
    '[class.slider--disabled]': 'disabled()',
    '[class.slider--dragging]': 'dragging()',
    '[style.--power]': 'power()',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'reset()',
    '(keydown)': 'onKeyDown($event)',
  },
})
export class PowerSlider {
  readonly disabled = input(false);
  readonly powerChange = output<number>();
  readonly release = output<number>();

  protected readonly power = signal(0);
  protected readonly dragging = computed(() => this.pointerId() !== null);
  protected readonly percent = computed(() => Math.round(this.power() * 100));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pointerId = signal<number | null>(null);

  protected onPointerDown(event: PointerEvent): void {
    if (this.disabled()) {
      return;
    }

    event.preventDefault();
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.pointerId.set(event.pointerId);
    this.setPower(this.powerFromPointer(event));
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.pointerId() === event.pointerId) {
      this.setPower(this.powerFromPointer(event));
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.pointerId() !== event.pointerId) {
      return;
    }

    this.host.nativeElement.releasePointerCapture(event.pointerId);
    this.fire(this.powerFromPointer(event));
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.disabled()) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        this.setPower(this.power() + KEYBOARD_STEP);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        this.setPower(this.power() - KEYBOARD_STEP);
        break;
      case 'Enter':
      case ' ':
        this.fire(this.power());
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  protected reset(): void {
    this.pointerId.set(null);
    this.setPower(0);
  }

  private fire(power: number): void {
    if (!this.disabled() && power >= MIN_SHOT_POWER) {
      this.release.emit(power);
    }

    this.reset();
  }

  private setPower(power: number): void {
    const clamped = Math.min(1, Math.max(0, power));

    this.power.set(clamped);
    this.powerChange.emit(clamped);
  }

  // Works for both orientations: power grows along the longer axis of the track. Pointers past
  // either end of the track clamp to the nearest end.
  private powerFromPointer(event: PointerEvent): number {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const fraction =
      rect.height >= rect.width
        ? (event.clientY - rect.top) / rect.height
        : (event.clientX - rect.left) / rect.width;

    return Math.min(1, Math.max(0, fraction));
  }
}
