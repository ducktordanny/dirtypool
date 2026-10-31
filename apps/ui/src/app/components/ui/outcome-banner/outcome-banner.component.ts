import { Component, computed, input } from '@angular/core';
import type { ShotOutcome } from '@dirtypool/contracts';
import type { ShotAnnouncement } from '../../../types/shot-announcement.type';

type Tone = 'good' | 'bad' | 'neutral';

const BANNERS: Record<ShotOutcome, { readonly label: string; readonly tone: Tone }> = {
  pocketed: { label: 'Nice shot', tone: 'good' },
  missed: { label: 'Missed', tone: 'neutral' },
  'opponent-ball': { label: "Opponent's ball", tone: 'bad' },
  'wrong-ball': { label: 'Wrong ball', tone: 'bad' },
  scratch: { label: 'Scratch', tone: 'bad' },
  'no-contact': { label: 'Air ball', tone: 'bad' },
  timeout: { label: "Time's up", tone: 'bad' },
  'eight-ball-win': { label: '8 ball!', tone: 'good' },
  'eight-ball-loss': { label: '8 ball too early', tone: 'bad' },
};

// A short animated label over the table after each shot. Re-created per announcement so the
// CSS animation restarts even when the same outcome repeats.
@Component({
  selector: 'dp-outcome-banner',
  template: `
    @for (banner of banners(); track banner.seq) {
      <div class="banner" [class]="'banner banner--' + banner.tone">{{ banner.label }}</div>
    }
  `,
  styleUrl: './outcome-banner.component.scss',
})
export class OutcomeBanner {
  readonly announcement = input<ShotAnnouncement | null>(null);

  protected readonly banners = computed(() => {
    const announcement = this.announcement();

    return announcement === null
      ? []
      : [{ seq: announcement.seq, ...BANNERS[announcement.outcome] }];
  });
}
