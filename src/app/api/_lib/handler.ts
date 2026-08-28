/**
 * HTTP boundary helpers.
 *
 * Every route handler under `src/app/api/**` is wrapped in `route()`, so the
 * three things that must always be true at the boundary are true in one place:
 *
 *  1. Errors are translated to stable, client-safe codes. A raw better-sqlite3
 *     or provider error never reaches a response body — it is logged
 *     server-side and reported as `INTERNAL`.
 *  2. Bodies and query strings are parsed through a Zod contract from
 *     `src/domain/schemas.ts`, never ad hoc.
 *  3. Mutating verbs enforce `X-Studio-Key` when `STUDIO_API_KEY` is set.
 */
import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import type { Studio } from '@/application/ports';
import { DomainError, httpStatusFor, isDomainError, type ErrorCode } from '@/domain/errors';
import { getStudio } from '@/infrastructure/container';
import { authorizeStudioMutation } from '@/infrastructure/security/studioMutationAuth';

export interface ApiContext {
  studio: Studio;
}

/** The composition root, reached exactly once per request. */
export function getContext(): ApiContext {
  return { studio: getStudio() };
}

/** Success envelope: every payload lives under `data`. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

/** Failure envelope: every payload lives under `error`. */
export function fail(code: ErrorCode, message: string, details: unknown = null, status?: number): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status: status ?? httpStatusFor(code) });
}

/**
 * Wraps a route handler with the error translation contract. The generic
 * argument list keeps the Next.js 15 handler signature intact, including the
 * `{ params: Promise<...> }` second argument.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse> | Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (isDomainError(error)) {
        return NextResponse.json(error.toJSON(), { status: error.httpStatus });
      }
      if (error instanceof ZodError) {
        return fail('VALIDATION_FAILED', 'The request did not match the expected shape.', error.flatten(), 400);
      }
      // Database and provider failures land here. The real error is logged for
      // the operator; the client only ever sees a generic message.
      const errorName = error instanceof Error ? error.name : typeof error;
      console.error('[api] unhandled error', { errorName });
      return fail('INTERNAL', 'The studio hit an unexpected error. Check the server log for details.', null, 500);
    }
  };
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const MAX_JSON_BYTES = 1024 * 1024;
const JSON_BODY_TIMEOUT_MS = 15_000;

/**
 * Single-operator auth. When `STUDIO_API_KEY` is unset the studio runs open on
 * localhost; when it is set, every mutating verb must present it. Reads are
 * always allowed so the UI can render without threading a key through.
 */
export function requireApiKey(request: Request): void {
  const { studio } = getContext();
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return;
  authorizeStudioMutation(
    {
      apiKey: studio.config.apiKey,
      hasNonOfflineProvider: studio.providers.descriptors().some((descriptor) => !descriptor.offline),
    },
    {
      presentedKey: request.headers.get('x-studio-key'),
      allowSession: false,
    },
  );
}

/** Reads a JSON body, tolerating an empty one as `{}`, and validates it. */
export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<output<S>> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_JSON_BYTES) {
      throw new DomainError('VALIDATION_FAILED', `JSON request exceeds the ${MAX_JSON_BYTES}-byte limit.`);
    }
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (reader) {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new DomainError('VALIDATION_FAILED', 'JSON request body did not complete within the allowed time.')),
          JSON_BODY_TIMEOUT_MS,
        );
      });
      while (true) {
        const { done, value } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        total += value.byteLength;
        if (total > MAX_JSON_BYTES) {
          await reader.cancel();
          throw new DomainError('VALIDATION_FAILED', `JSON request exceeds the ${MAX_JSON_BYTES}-byte limit.`);
        }
        chunks.push(value);
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DomainError('VALIDATION_FAILED', 'The request body must be valid UTF-8 JSON.');
  }
  let payload: unknown = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'The request body must be valid JSON.');
    }
  }
  return schema.parse(payload);
}

/** Validates `?a=1&b=2` through a Zod contract. */
export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): output<S> {
  const params = new URL(request.url).searchParams;
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) record[key] = value;
  return schema.parse(record);
}
