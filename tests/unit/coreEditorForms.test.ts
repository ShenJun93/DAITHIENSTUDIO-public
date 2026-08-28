/**
 * TASK-UI-CORE-EDITORS-001 Slice 1: shared form foundation primitives, pure
 * and dependency-free — no database, no Next.js request context. Anything
 * that needs a real project, `useRouter`, or `notFound()` lives in
 * tests/integration/coreEditorForms.test.ts instead, rendered against a
 * real temp SQLite database with `next/navigation` mocked (this repo's
 * `environment: 'node'` Vitest config has no DOM/jsdom, and `node:fs` is
 * architecturally confined to src/infrastructure/storage|db/** and
 * scripts/**, so these primitives are verified by real rendering via
 * `react-dom/server`, matching tests/unit/designPrimitives.test.ts, not by
 * reading source text).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { FormSection } from '@/components/ui/formSection';
import { ValidationSummary } from '@/components/ui/validationSummary';
import { SaveBar } from '@/components/ui/saveBar';
import { StatusSelect } from '@/components/ui/statusSelect';
import { useDirtyStateGuard } from '@/components/ui/useDirtyStateGuard';
import { BIBLE_STATUSES } from '@/domain/enums';
import { characterInputSchema } from '@/domain/schemas';
import { zodFieldErrors } from '@/app/_lib/zodFieldErrors';

Object.assign(globalThis, { React });

describe('FormSection', () => {
  it('renders a real <fieldset>/<legend>, not a decorative div', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FormSection, { title: 'Prompt & lock', hint: 'Used when compiled.', children: 'x' }),
    );
    expect(markup).toContain('<fieldset');
    expect(markup).toContain('<legend');
    expect(markup).toContain('Prompt &amp; lock');
    expect(markup).toContain('Used when compiled.');
  });

  it('renders without a hint when none is given', () => {
    const markup = renderToStaticMarkup(React.createElement(FormSection, { title: 'Section', children: 'x' }));
    expect(markup).toContain('Section');
  });
});

describe('ValidationSummary', () => {
  it('renders nothing when there are no errors', () => {
    const markup = renderToStaticMarkup(React.createElement(ValidationSummary, { errors: {} }));
    expect(markup).toBe('');
  });

  it('announces errors and links each one to its field', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ValidationSummary, { errors: { name: 'Name is required.' } }),
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('href="#field-name"');
    expect(markup).toContain('Name is required.');
  });

  it('lists every field error, not only the first', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ValidationSummary, {
        errors: { name: 'Name is required.', status: 'Invalid status.' },
      }),
    );
    expect(markup).toContain('href="#field-name"');
    expect(markup).toContain('href="#field-status"');
  });

  it('appends an optional hrefSuffix to every deep-link, for a form repeated per list row (Episode UI migration: one row per episode id)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ValidationSummary, {
        errors: { title: 'Title is required.' },
        hrefSuffix: '-ep_123',
      }),
    );
    expect(markup).toContain('href="#field-title-ep_123"');
  });
});

describe('SaveBar', () => {
  it('shows the idle label and enabled buttons when not pending', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SaveBar, {
        pending: false,
        idleLabel: 'Create character',
        savingLabel: 'Creating…',
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain('Create character');
    expect(markup).not.toContain('disabled=""');
  });

  it('shows the saving label and disables both buttons while pending', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SaveBar, {
        pending: true,
        idleLabel: 'Create character',
        savingLabel: 'Creating…',
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain('Creating…');
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
  });

  it('renders an accessibly-announced inline status message when given one', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SaveBar, {
        pending: false,
        idleLabel: 'Create character',
        savingLabel: 'Creating…',
        status: 'Created CHAR004.',
      }),
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Created CHAR004.');
  });

  it('omits the Cancel button entirely when no onCancel is given, rather than a disabled fake one', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SaveBar, { pending: false, idleLabel: 'Save', savingLabel: 'Saving…' }),
    );
    expect(markup.match(/<button/g)?.length).toBe(1);
  });
});

describe('StatusSelect', () => {
  it('renders every option from the real bible status enum and preserves the default', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StatusSelect, { name: 'status', defaultValue: 'draft', options: BIBLE_STATUSES }),
    );
    for (const status of BIBLE_STATUSES) {
      expect(markup).toContain(`value="${status}"`);
    }
    expect(markup).toContain('<option value="draft" selected=""');
  });

  it('uses the raw value as the visible label when no labels map is given (unchanged default for every existing caller)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StatusSelect, { name: 'status', defaultValue: 'draft', options: ['draft', 'approved'] }),
    );
    expect(markup).toContain('>draft<');
    expect(markup).toContain('>approved<');
  });

  it('uses a friendlier label per value when an optional labels map is given (Episode UI migration: "in-production" -> "In production")', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StatusSelect, {
        name: 'status',
        defaultValue: 'in-production',
        options: ['draft', 'in-production', 'completed'],
        labels: { draft: 'Draft', 'in-production': 'In production', completed: 'Completed' },
      }),
    );
    expect(markup).toContain('value="in-production" selected=""');
    expect(markup).toContain('>In production<');
    expect(markup).not.toContain('>in-production<');
  });
});

describe('useDirtyStateGuard', () => {
  function readHook() {
    let captured: ReturnType<typeof useDirtyStateGuard> | undefined;
    function Harness() {
      captured = useDirtyStateGuard();
      return null;
    }
    renderToStaticMarkup(React.createElement(Harness));
    if (!captured) throw new Error('hook did not run');
    return captured;
  }

  it('starts clean — no false dirty state from initial values', () => {
    const { dirty } = readHook();
    expect(dirty).toBe(false);
  });

  it('confirmDiscard never touches window.confirm while the form is untouched', () => {
    const { confirmDiscard } = readHook();
    // If this called window.confirm, it would throw here — there is no `window`
    // in this Vitest `environment: 'node'` run — proving the short-circuit
    // on a clean form works without a real browser.
    expect(confirmDiscard()).toBe(true);
  });
});

describe('zodFieldErrors', () => {
  it('maps a real characterInputSchema failure to its field, keeping the first message per field', () => {
    const result = characterInputSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    const errors = zodFieldErrors((result as { success: false; error: ZodError }).error);
    expect(errors.name).toBeTruthy();
    expect(Object.keys(errors)).toEqual(['name']);
  });

  it('falls back to a "form" key for a root-level issue', () => {
    const error = new ZodError([{ code: 'custom', path: [], message: 'Something is wrong.' }]);
    expect(zodFieldErrors(error)).toEqual({ form: 'Something is wrong.' });
  });

  it('rejects an out-of-enum status value the same way the schema does', () => {
    const result = characterInputSchema.safeParse({ name: 'Valid', status: 'not-a-real-status' });
    expect(result.success).toBe(false);
    const errors = zodFieldErrors((result as { success: false; error: ZodError }).error);
    expect(errors.status).toBeTruthy();
  });
});
