import { z } from 'zod';

export const comfyUiStatusResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('unconfigured'),
    message: z.string().min(1),
  }),
  z.object({
    status: z.literal('ready'),
    model: z.string().min(1),
  }),
  z.object({
    status: z.literal('unreachable'),
    error: z.string().min(1),
    model: z.string().min(1).optional(),
  }),
]);
export type ComfyUiStatusResponse = z.infer<typeof comfyUiStatusResponseSchema>;
