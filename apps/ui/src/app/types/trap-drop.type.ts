import type { TrapKind, Vec2 } from '@dirtypool/contracts';

// A trap the player wants to put on the table.
export interface TrapDrop {
  readonly kind: TrapKind;
  readonly position: Vec2;
}
