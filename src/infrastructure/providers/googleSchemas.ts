/**
 * Zod contracts for every Google response shape the adapters consume.
 *
 * Kept in infrastructure, not `src/domain/schemas.ts`: rule 05 forbids a
 * provider name leaking into the domain layer, and these shapes describe
 * Google's wire format, not an application contract. `.passthrough()` keeps
 * unknown fields as diagnostic metadata instead of rejecting a response for
 * carrying a field the application does not read yet.
 */
import { z } from 'zod';
import { ProviderError } from './retry';

/**
 * `Buffer.from(s, 'base64')` silently discards characters outside the base64
 * alphabet and never throws, so an unvalidated `z.string()` lets a malformed
 * payload become a real stored asset. Validating here is what makes
 * "a malformed response creates no asset" true.
 */
const base64Payload = z
  .string()
  .transform((value) => value.replace(/[\t\n\f\r ]/g, ''))
  .refine(
    (value) =>
      value.length >= 2 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/.test(value) &&
      Buffer.from(value, 'base64').byteLength > 0,
    'not valid base64',
  );

export function parseGoogleResponse<S extends z.ZodTypeAny>(schema: S, json: unknown, label: string): z.infer<S> {
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ProviderError({
      errorClass: 'fatal',
      code: 'PROVIDER_BAD_RESPONSE',
      message: `Google ${label} response did not match the expected contract.`,
    });
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Imagen — predict
// ---------------------------------------------------------------------------

export const googleImagePredictResponseSchema = z
  .object({
    predictions: z
      .array(
        z
          .object({
            bytesBase64Encoded: base64Payload.optional(),
            mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Veo — predictLongRunning + operation polling
// ---------------------------------------------------------------------------

export const googleOperationErrorSchema = z
  .object({
    code: z.number().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const googleVideoSampleSchema = z
  .object({
    video: z
      .object({
        bytesBase64Encoded: base64Payload.optional(),
        uri: z.string().optional(),
      })
      .passthrough()
      .optional(),
    bytesBase64Encoded: base64Payload.optional(),
    uri: z.string().optional(),
  })
  .passthrough();
export type GoogleVideoSample = z.infer<typeof googleVideoSampleSchema>;

export const googleVideoSamplesSchema = z.array(googleVideoSampleSchema).default([]);

const googleOperationResponseSchema = z
  .object({
    generatedSamples: googleVideoSamplesSchema.optional(),
    generateVideoResponse: z
      .object({ generatedSamples: googleVideoSamplesSchema.optional() })
      .passthrough()
      .optional(),
    predictions: googleVideoSamplesSchema.optional(),
  })
  .passthrough();

export const googleOperationSchema = z
  .object({
    name: z.string().optional(),
    done: z.boolean().optional(),
    error: googleOperationErrorSchema.optional(),
    response: googleOperationResponseSchema.optional(),
  })
  .passthrough();
export type GoogleOperation = z.infer<typeof googleOperationSchema>;

// ---------------------------------------------------------------------------
// Gemini — generateContent (structured JSON output only)
// ---------------------------------------------------------------------------

export const googleGenerateContentResponseSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z.array(z.object({ text: z.string().optional() }).passthrough()).default([]),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
    usageMetadata: z
      .object({
        totalTokenCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Cloud Text-to-Speech — synthesize
// ---------------------------------------------------------------------------

export const googleTtsResponseSchema = z
  .object({
    audioContent: base64Payload.optional(),
  })
  .passthrough();
