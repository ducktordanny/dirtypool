import type { Shot } from '@dirtypool/contracts';

// A shot the opponent just played, numbered so the table replays the cue strike every time.
export interface RemoteShot {
  readonly seq: number;
  readonly shot: Shot;
}
