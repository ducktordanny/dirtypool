import { z } from 'zod';

export const healthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z.object({ message: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;
