import { z } from 'zod';

export const vec2Schema = z.object({ x: z.number(), y: z.number() });
export type Vec2 = z.infer<typeof vec2Schema>;

export const ballIdSchema = z.number().int().min(0).max(15);
export type BallId = z.infer<typeof ballIdSchema>;

export const ballSchema = z.object({
  id: ballIdSchema,
  position: vec2Schema,
  velocity: vec2Schema,
  pocketed: z.boolean(),
});
export type Ball = z.infer<typeof ballSchema>;

export const tableStateSchema = z.object({ balls: z.array(ballSchema).length(16) });
export type TableState = z.infer<typeof tableStateSchema>;

export const shotSchema = z.object({
  direction: vec2Schema,
  power: z.number().min(0).max(1),
});
export type Shot = z.infer<typeof shotSchema>;

export const playerIndexSchema = z.union([z.literal(0), z.literal(1)]);
export type PlayerIndex = z.infer<typeof playerIndexSchema>;

export const ballGroupSchema = z.enum(['solids', 'stripes']);
export type BallGroup = z.infer<typeof ballGroupSchema>;

export const playerStateSchema = z.object({
  // Own-group balls pocketed so far.
  score: z.number().int().min(0),
  // Null while the table is open.
  group: ballGroupSchema.nullable(),
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
});
export type GameState = z.infer<typeof gameStateSchema>;
export type ShotOutcome = NonNullable<GameState['lastOutcome']>;
