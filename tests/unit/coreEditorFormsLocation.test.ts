/**
 * TASK-UI-CORE-EDITORS-001 Slice 2: Location create validation, pure and
 * dependency-free. The shared primitives themselves (FormSection,
 * ValidationSummary, SaveBar, StatusSelect, useDirtyStateGuard) are already
 * covered by tests/unit/coreEditorForms.test.ts — reused unchanged here, so
 * they are not re-tested. This file only proves zodFieldErrors behaves the
 * same way against locationInputSchema as it does against
 * characterInputSchema (it is schema-agnostic by design).
 */
import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { locationInputSchema } from '@/domain/schemas';
import { zodFieldErrors } from '@/app/_lib/zodFieldErrors';

describe('zodFieldErrors against locationInputSchema', () => {
  it('maps an empty name to its field', () => {
    const result = locationInputSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    const errors = zodFieldErrors((result as { success: false; error: ZodError }).error);
    expect(errors.name).toBeTruthy();
    expect(Object.keys(errors)).toEqual(['name']);
  });

  it('rejects an out-of-enum status value the same way the schema does', () => {
    const result = locationInputSchema.safeParse({ name: 'Valid Location', status: 'not-a-real-status' });
    expect(result.success).toBe(false);
    const errors = zodFieldErrors((result as { success: false; error: ZodError }).error);
    expect(errors.status).toBeTruthy();
  });

  it('accepts a minimal valid location and applies schema defaults, not fabricated values', () => {
    const result = locationInputSchema.safeParse({ name: 'Valid Location' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('interior');
      expect(result.data.status).toBe('draft');
      expect(result.data).not.toHaveProperty('lockEnabled');
    }
  });
});
