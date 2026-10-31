import { z } from 'zod';
import { playerNameSchema, roomCodeSchema } from './room.js';

// A room with a free seat, as listed on the home page.
export const openRoomSchema = z.object({
  code: roomCodeSchema,
  host: playerNameSchema,
  // True when a game is already under way and the seat was vacated mid-game.
  inProgress: z.boolean(),
});
export type OpenRoom = z.infer<typeof openRoomSchema>;

export const openRoomsResponseSchema = z.object({ rooms: z.array(openRoomSchema) });
export type OpenRoomsResponse = z.infer<typeof openRoomsResponseSchema>;
