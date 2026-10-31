import { z } from 'zod';
import { gameStateSchema, playerIndexSchema, shotSchema } from './game.js';

export const roomCodeSchema = z
  .string()
  .length(4)
  .regex(/^[A-Z]{4}$/u);
export type RoomCode = z.infer<typeof roomCodeSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create-room') }),
  z.object({ type: z.literal('join-room'), code: roomCodeSchema }),
  z.object({ type: z.literal('shoot'), shot: shotSchema }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('room-joined'),
    code: roomCodeSchema,
    playerIndex: playerIndexSchema,
    playerCount: z.number().int().min(1).max(2),
    game: gameStateSchema,
  }),
  z.object({ type: z.literal('player-count'), playerCount: z.number().int().min(0).max(2) }),
  z.object({
    type: z.literal('shot-played'),
    playerIndex: playerIndexSchema,
    shot: shotSchema,
    game: gameStateSchema,
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
