import { TestBed } from '@angular/core/testing';
import { AudioService } from './audio.service';

describe('AudioService', () => {
  let service: AudioService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(AudioService);
  });

  it('starts unmuted and remembers a mute across instances', () => {
    expect(service.muted()).toBe(false);

    service.toggleMuted();

    expect(service.muted()).toBe(true);
    expect(localStorage.getItem('dirtypool.muted')).toBe('true');
  });

  it('stays silent without an AudioContext instead of throwing', () => {
    expect(() => {
      service.unlock();
      service.cueStrike(0.8);
      service.tableEvents([
        { kind: 'collision', ballIds: [0, 1], speed: 2 },
        { kind: 'cushion', ballId: 1, speed: 1 },
        { kind: 'pocketed', ballId: 1, pocketIndex: 0 },
      ]);
      service.shotOutcome('scratch', false);
      service.shotOutcome('eight-ball-win', true);
    }).not.toThrow();
  });
});
