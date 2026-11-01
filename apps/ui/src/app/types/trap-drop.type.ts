import type { TrapKind, Vec2 } from '@dirtypool/contracts';

// A trap the player wants to put on the table; walls also say which way they run.
export interface TrapDrop {
  readonly kind: TrapKind;
  readonly position: Vec2;
  readonly direction?: Vec2;
}
