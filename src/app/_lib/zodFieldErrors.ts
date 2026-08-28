import type { ZodError } from 'zod';

/**
 * Maps every Zod issue to its field, keeping only the first message per
 * field. Lives outside src/app/actions.ts because that file has the
 * `'use server'` directive, which requires every export to be an async
 * function — this is a plain sync helper, not a server action.
 */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
