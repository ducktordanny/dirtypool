import { z } from 'zod';

export const vec2Schema = z.object({ x: z.number(), y: z.number() });
export type Vec2 = z.infer<typeof vec2Schema>;

export const ballIdSchema = z.number().int().min(0).max(15);
export type BallId = z.infer<typeof ballIdSchema>;

// Spin the ball still carries while rolling: x is side spin, y is top (+) or back (-) spin,
// both in m/s of velocity they can still turn into. Absent once the ball is at rest.
export const ballSchema = z.object({
  id: ballIdSchema,
  position: vec2Schema,
  velocity: vec2Schema,
  pocketed: z.boolean(),
  spin: vec2Schema.optional(),
});
export type Ball = z.infer<typeof ballSchema>;

export const playerIndexSchema = z.union([z.literal(0), z.literal(1)]);
export type PlayerIndex = z.infer<typeof playerIndexSchema>;

export const ballGroupSchema = z.enum(['solids', 'stripes']);
export type BallGroup = z.infer<typeof ballGroupSchema>;

// Bumpers and springs bounce balls away, walls block them, fans push them along, wells pull them
// in, magnets pull one group only, holes swallow what reaches the middle (counted as pocketed),
// mud and ice change the cloth under them, and a plug closes a pocket.
export const trapKindSchema = z.enum([
  'bumper',
  'spring',
  'wall',
  'fan',
  'well',
  'magnet',
  'hole',
  'mud',
  'ice',
  'plug',
]);
export type TrapKind = z.infer<typeof trapKindSchema>;

// What a player asks to put down; the trap itself adds id, owner and lifetime.
export const trapRequestSchema = z.object({
  kind: trapKindSchema,
  position: vec2Schema,
  // Walls and fans: the unit vector they run along.
  direction: vec2Schema.optional(),
  // Magnets: which group they pull.
  group: ballGroupSchema.optional(),
});
export type TrapRequest = z.infer<typeof trapRequestSchema>;

export const trapSchema = trapRequestSchema.extend({
  // Unique among the traps on the table.
  id: z.number().int().min(0),
  owner: playerIndexSchema,
  // The trap disappears once this many more shots have been taken.
  shotsLeft: z.number().int().min(1),
});
export type Trap = z.infer<typeof trapSchema>;

export const tableStateSchema = z.object({
  balls: z.array(ballSchema).length(16),
  traps: z.array(trapSchema),
});
export type TableState = z.infer<typeof tableStateSchema>;

// Where the cue tip strikes the ball, as a point in the unit disk: x right, y up (top spin).
export const spinSchema = vec2Schema.refine(
  ({ x, y }) => x * x + y * y <= 1 + 1e-6,
  'Spin must lie inside the unit disk',
);
export type Spin = z.infer<typeof spinSchema>;

export const shotSchema = z.object({
  direction: vec2Schema,
  power: z.number().min(0).max(1),
  spin: spinSchema.optional(),
});
export type Shot = z.infer<typeof shotSchema>;

export const playerStateSchema = z.object({
  // Own-group balls pocketed so far.
  score: z.number().int().min(0),
  // Null while the table is open.
  group: ballGroupSchema.nullable(),
  // Traps still in the pouch for this game.
  trapsLeft: z.number().int().min(0),
});
export type PlayerState = z.infer<typeof playerStateSchema>;

export const gameStateSchema = z.object({
  table: tableStateSchema,
  players: z.tuple([playerStateSchema, playerStateSchema]),
  currentPlayer: playerIndexSchema,
  phase: z.enum(['aiming', 'finished']),
  winner: playerIndexSchema.nullable(),
  lastOutcome: z
    .enum([
      'pocketed',
      'missed',
      'opponent-ball',
      'wrong-ball',
      'scratch',
      'no-contact',
      'timeout',
      'eight-ball-win',
      'eight-ball-loss',
    ])
    .nullable(),
  // Object balls in the order they went down.
  pocketedBalls: z.array(ballIdSchema).max(15),
  // After a foul the incoming player may put the cue ball anywhere before shooting.
  ballInHand: z.boolean(),
  // One trap per shot: set once the player on turn has dropped theirs.
  trapPlaced: z.boolean(),
});
export type GameState = z.infer<typeof gameStateSchema>;
export type ShotOutcome = NonNullable<GameState['lastOutcome']>;
