import { z } from 'zod';

export const comfyUiParamsSchema = z
  .object({
    steps: z.number().int().min(1).max(50).default(8),
    cfg: z.number().min(1).max(20).default(6),
    samplerName: z.enum(['euler', 'euler_ancestral', 'dpmpp_2m']).default('euler'),
    scheduler: z.enum(['normal', 'karras', 'simple']).default('normal'),
  })
  .passthrough();

export const comfyUiSubmitSchema = z
  .object({
    prompt_id: z.string().min(1),
    number: z.number().optional(),
    node_errors: z.record(z.unknown()).optional(),
  })
  .passthrough();

const comfyUiImageRefSchema = z
  .object({
    filename: z.string().min(1),
    subfolder: z.string().default(''),
    type: z.enum(['input', 'output', 'temp']).default('output'),
  })
  .passthrough();

const comfyUiOutputSchema = z
  .object({
    images: z.array(comfyUiImageRefSchema).optional(),
  })
  .passthrough();

export const comfyUiHistoryEntrySchema = z
  .object({
    outputs: z.record(comfyUiOutputSchema),
    status: z
      .object({
        completed: z.boolean(),
        status_str: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

export const comfyUiHistorySchema = z.record(comfyUiHistoryEntrySchema);

export type ComfyUiImageRef = z.infer<typeof comfyUiImageRefSchema>;

