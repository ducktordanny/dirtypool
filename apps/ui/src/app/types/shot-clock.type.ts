// A running shot clock: when it ends (performance.now() milliseconds) and how long it was.
export interface ShotClock {
  readonly deadline: number;
  readonly durationMs: number;
}
