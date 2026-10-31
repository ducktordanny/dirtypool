import { z } from 'zod';
import { gameStateSchema, playerIndexSchema, shotSchema } from './game.js';

export const roomCodeSchema = z
  .string()
  .length(4)
  .regex(/^[A-Z]{4}$/u);
export type RoomCode = z.infer<typeof roomCodeSchema>;

export const PLAYER_NAME_MAX_LENGTH = 16;
export const playerNameSchema = z.string().trim().min(1).max(PLAYER_NAME_MAX_LENGTH);
export type PlayerName = z.infer<typeof playerNameSchema>;

// Who sits in seat 0 and seat 1; null while a seat is empty.
export const rosterSchema = z.tuple([playerNameSchema.nullable(), playerNameSchema.nullable()]);
export type Roster = z.infer<typeof rosterSchema>;

// Milliseconds the current player has left to shoot when the message was sent, or null when
// no clock is running (waiting for an opponent, game over).
export const shotClockSchema = z.number().nonnegative().nullable();

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create-room'), name: playerNameSchema }),
  z.object({ type: z.literal('join-room'), code: roomCodeSchema, name: playerNameSchema }),
  z.object({ type: z.literal('shoot'), shot: shotSchema }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('room-joined'),
    code: roomCodeSchema,
    playerIndex: playerIndexSchema,
    roster: rosterSchema,
    game: gameStateSchema,
    clock: shotClockSchema,
  }),
  z.object({ type: z.literal('roster'), roster: rosterSchema, clock: shotClockSchema }),
  z.object({
    type: z.literal('shot-played'),
    playerIndex: playerIndexSchema,
    shot: shotSchema,
    game: gameStateSchema,
    // Counted from when the shot was sent; it includes the time the balls will be rolling.
    clock: shotClockSchema,
  }),
  z.object({ type: z.literal('turn-passed'), game: gameStateSchema, clock: shotClockSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
