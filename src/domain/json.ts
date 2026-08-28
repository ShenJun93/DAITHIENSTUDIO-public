/** JSON-column helpers. External/stored data is always validated, never cast. */
import type { ZodTypeAny, output } from 'zod';
import { DomainError } from './errors';

/**
 * Parses a stored JSON string. A malformed or non-conforming value returns the
 * fallback and warns, so one bad row can never crash a whole page.
 */
export function parseJson<S extends ZodTypeAny>(
  raw: string,
  schema: S,
  fallback: output<S>,
  context = 'json column',
): output<S> {
  let value: unknown;
  try {
    value = JSON.parse(raw === '' ? 'null' : raw);
  } catch {
    return fallback;
  }
  if (value === null || value === undefined) return fallback;

  const result = schema.safeParse(value);
  if (!result.success) {
    console.warn(`[json] ${context} failed validation, using fallback: ${result.error.issues[0]?.message ?? ''}`);
    return fallback;
  }
  return result.data as output<S>;
}

/** Parses input that must be correct — throws a typed domain error if not. */
export function parseJsonStrict<S extends ZodTypeAny>(raw: string, schema: S, context = 'json column'): output<S> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new DomainError('VALIDATION_FAILED', `${context} is not valid JSON`, (error as Error).message);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DomainError('VALIDATION_FAILED', `${context} does not match its schema`, result.error.flatten());
  }
  return result.data as output<S>;
}

export function stringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}
