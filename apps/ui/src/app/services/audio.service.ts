import { Injectable, computed, signal } from '@angular/core';
import type { ShotOutcome } from '@dirtypool/contracts';
import { MAX_SHOT_SPEED, type TableEvent } from '@dirtypool/game';

const STORAGE_KEY = 'dirtypool.muted';
const MASTER_GAIN = 0.6;
// A break produces dozens of contacts in a few frames; only the hardest ones are voiced so the
// pile-up stays a clatter instead of a wall of noise.
const MAX_CLACKS_PER_FRAME = 3;
const MAX_THUDS_PER_FRAME = 2;
const MAX_DROPS_PER_FRAME = 2;
const MAX_BOINGS_PER_FRAME = 2;
const NOISE_SECONDS = 0.5;
const FOULS: ReadonlySet<ShotOutcome> = new Set([
  'opponent-ball',
  'wrong-ball',
  'scratch',
  'no-contact',
  'timeout',
]);

type Collision = Extract<TableEvent, { kind: 'collision' }>;
type Cushion = Extract<TableEvent, { kind: 'cushion' }>;
type Bumper = Extract<TableEvent, { kind: 'bumper' }>;

interface Burst {
  readonly frequency: number;
  readonly q: number;
  readonly seconds: number;
  readonly gain: number;
  readonly at?: number;
}

interface Tone {
  readonly frequency: number;
  readonly type: OscillatorType;
  readonly seconds: number;
  readonly gain: number;
  readonly at?: number;
  readonly slideTo?: number;
}

// Every sound is synthesised on the fly from filtered noise and short tones, so there are no
// assets to load. Nothing plays until the browser has seen a user gesture or while muted.
@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly muted = computed(() => this.mutedState());

  private readonly mutedState = signal(readStoredMute());
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  // Call from any pointer or key handler: browsers only start audio inside a user gesture.
  unlock(): void {
    if (this.mutedState() || typeof AudioContext === 'undefined') {
      return;
    }

    this.context ??= this.createContext();

    if (this.context?.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
  }

  toggleMuted(): void {
    const muted = !this.mutedState();

    this.mutedState.set(muted);

    try {
      localStorage.setItem(STORAGE_KEY, String(muted));
    } catch {
      // Blocked storage: the choice still holds for this page.
    }

    if (!muted) {
      this.unlock();
    }
  }

  cueStrike(power: number): void {
    const out = this.ready();

    if (out === null) {
      return;
    }

    const level = 0.3 + 0.7 * clamp01(power);

    this.burst(out, { frequency: 1600 + 1200 * level, q: 1.2, seconds: 0.03, gain: 0.5 * level });
    this.tone(out, { frequency: 700, type: 'triangle', seconds: 0.05, gain: 0.25 * level });
  }

  // One frame's worth of simulation events.
  tableEvents(events: readonly TableEvent[]): void {
    const out = this.ready();

    if (out === null || events.length === 0) {
      return;
    }

    events
      .filter((event): event is Collision => event.kind === 'collision')
      .sort((a, b) => b.speed - a.speed)
      .slice(0, MAX_CLACKS_PER_FRAME)
      .forEach((event, index) => this.clack(out, impactLevel(event.speed) / (1 + index)));

    events
      .filter((event): event is Cushion => event.kind === 'cushion')
      .sort((a, b) => b.speed - a.speed)
      .slice(0, MAX_THUDS_PER_FRAME)
      .forEach((event, index) => this.thud(out, impactLevel(event.speed) / (1 + index)));

    events
      .filter((event): event is Bumper => event.kind === 'bumper')
      .sort((a, b) => b.speed - a.speed)
      .slice(0, MAX_BOINGS_PER_FRAME)
      .forEach((event, index) => this.boing(out, impactLevel(event.speed) / (1 + index)));

    events
      .filter((event) => event.kind === 'pocketed')
      .slice(0, MAX_DROPS_PER_FRAME)
      .forEach((_, index) => this.drop(out, index * 0.06));
  }

  shotOutcome(outcome: ShotOutcome, celebrate: boolean): void {
    const out = this.ready();

    if (out === null) {
      return;
    }

    if (outcome === 'eight-ball-win' || outcome === 'eight-ball-loss') {
      if (celebrate) {
        this.fanfare(out);
      } else {
        this.defeat(out);
      }
    } else if (FOULS.has(outcome)) {
      this.foul(out);
    }
  }

  private ready(): GainNode | null {
    if (this.mutedState() || this.context === null || this.output === null) {
      return null;
    }

    if (this.context.state !== 'running') {
      void this.context.resume().catch(() => undefined);
      return null;
    }

    return this.output;
  }

  private createContext(): AudioContext | null {
    try {
      const context = new AudioContext();
      const output = context.createGain();
      // Several hits in one frame would otherwise clip.
      const limiter = context.createDynamicsCompressor();

      output.gain.value = MASTER_GAIN;
      output.connect(limiter).connect(context.destination);
      this.output = output;

      return context;
    } catch {
      return null;
    }
  }

  private clack(out: GainNode, level: number): void {
    this.burst(out, {
      frequency: 2800 + 1600 * level,
      q: 0.8,
      seconds: 0.02 + 0.015 * level,
      gain: 0.9 * level,
    });
    this.tone(out, { frequency: 2400, type: 'sine', seconds: 0.02, gain: 0.3 * level });
  }

  private thud(out: GainNode, level: number): void {
    this.tone(out, {
      frequency: 140,
      slideTo: 90,
      type: 'sine',
      seconds: 0.1,
      gain: 0.6 * level,
    });
    this.burst(out, { frequency: 500, q: 0.7, seconds: 0.04, gain: 0.3 * level });
  }

  // A pinball bumper: a rubbery pitch bend up with a snap on top.
  private boing(out: GainNode, level: number): void {
    this.tone(out, {
      frequency: 220,
      slideTo: 440,
      type: 'triangle',
      seconds: 0.12,
      gain: 0.5 * level,
    });
    this.burst(out, { frequency: 1800, q: 1, seconds: 0.02, gain: 0.4 * level });
  }

  // A thunk into the pocket followed by the ball rattling down the chute.
  private drop(out: GainNode, at: number): void {
    this.tone(out, { frequency: 260, slideTo: 120, type: 'sine', seconds: 0.14, gain: 0.5, at });
    this.burst(out, { frequency: 700, q: 0.6, seconds: 0.12, gain: 0.45, at });
    this.burst(out, { frequency: 500, q: 0.8, seconds: 0.08, gain: 0.25, at: at + 0.1 });
    this.burst(out, { frequency: 450, q: 0.8, seconds: 0.06, gain: 0.12, at: at + 0.19 });
  }

  private fanfare(out: GainNode): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index, notes) => {
      const last = index === notes.length - 1;

      this.tone(out, {
        frequency,
        type: 'triangle',
        seconds: last ? 0.5 : 0.16,
        gain: 0.35,
        at: index * 0.11,
      });
    });
  }

  private defeat(out: GainNode): void {
    [392, 311.13, 233.08].forEach((frequency, index) => {
      this.tone(out, {
        frequency,
        slideTo: frequency * 0.94,
        type: 'triangle',
        seconds: 0.24,
        gain: 0.3,
        at: index * 0.2,
      });
    });
  }

  private foul(out: GainNode): void {
    this.tone(out, { frequency: 150, slideTo: 110, type: 'square', seconds: 0.2, gain: 0.18 });
  }

  private burst(out: GainNode, { frequency, q, seconds, gain, at = 0 }: Burst): void {
    const context = out.context;
    const start = context.currentTime + at;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();

    source.buffer = this.noiseBuffer(context);
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter).connect(envelope).connect(out);
    source.start(start, 0, seconds + 0.01);
  }

  private tone(out: GainNode, { frequency, type, seconds, gain, at = 0, slideTo }: Tone): void {
    const context = out.context;
    const start = context.currentTime + at;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);

    if (slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + seconds);
    }

    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(envelope).connect(out);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  private noiseBuffer(context: BaseAudioContext): AudioBuffer {
    if (this.noise === null) {
      const buffer = context.createBuffer(
        1,
        context.sampleRate * NOISE_SECONDS,
        context.sampleRate,
      );
      const samples = buffer.getChannelData(0);

      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = Math.random() * 2 - 1;
      }

      this.noise = buffer;
    }

    return this.noise;
  }
}

// Loudness grows with the square root of the closing speed, which reads closer to how hits sound.
function impactLevel(speed: number): number {
  return Math.sqrt(clamp01(speed / MAX_SHOT_SPEED));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readStoredMute(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
