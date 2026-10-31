import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PowerSlider } from './power-slider.component';

@Component({
  imports: [PowerSlider],
  template: `
    <dp-power-slider
      [disabled]="disabled()"
      (powerChange)="powers.push($event)"
      (release)="released.push($event)"
    />
  `,
})
class Host {
  readonly disabled = signal(false);
  readonly powers: number[] = [];
  readonly released: number[] = [];
}

describe('PowerSlider', () => {
  function setup(disabled = false): { host: Host; slider: HTMLElement } {
    const fixture = TestBed.createComponent(Host);

    fixture.componentInstance.disabled.set(disabled);
    fixture.detectChanges();

    return {
      host: fixture.componentInstance,
      slider: fixture.nativeElement.querySelector('dp-power-slider'),
    };
  }

  function press(slider: HTMLElement, key: string): void {
    slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  it('charges with the keyboard and fires on enter', () => {
    const { host, slider } = setup();

    press(slider, 'ArrowDown');
    press(slider, 'ArrowDown');
    press(slider, 'Enter');

    expect(host.powers).toEqual([0.05, 0.1, 0]);
    expect(host.released).toEqual([0.1]);
  });

  it('does not fire below the minimum power', () => {
    const { host, slider } = setup();

    press(slider, 'Enter');

    expect(host.released).toEqual([]);
  });

  it('ignores input while disabled', () => {
    const { host, slider } = setup(true);

    press(slider, 'ArrowDown');
    press(slider, 'Enter');

    expect(host.powers).toEqual([]);
    expect(host.released).toEqual([]);
  });
});
