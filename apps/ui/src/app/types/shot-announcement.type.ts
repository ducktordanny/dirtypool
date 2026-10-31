import type { ShotOutcome } from '@dirtypool/contracts';

// What the last shot did, numbered so repeated outcomes still replay the banner.
export interface ShotAnnouncement {
  readonly seq: number;
  readonly outcome: ShotOutcome;
}
