'use client';

/**
 * Location creation (TASK-UI-CORE-EDITORS-001 Slice 2). Calls the existing,
 * unchanged bibleService.createLocation through createLocationAction — no
 * new service method, no schema change. Only a deliberately compact subset
 * of locationInputSchema is exposed here (name, type, era, promptBlock,
 * negativePrompt, status), matching Slice 1's precedent: the full
 * details.* / colorPalette / continuityNotes fields stay reachable at the
 * existing, unchanged /projects/[slug]/bibles update form immediately after
 * creation. `code` is never exposed — it is always server-assigned via
 * bibles.nextCode. LocationRecord has no lock concept at all (no
 * `lockEnabled` field in the domain model), so this form has no lock
 * control and no lock copy of any kind — do not add one.
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import { BIBLE_STATUSES } from '@/domain/enums';
import { Field, Notice, inputClass } from '@/components/ui';
import { FormSection } from '@/components/ui/formSection';
import { FieldError, ValidationSummary } from '@/components/ui/validationSummary';
import { SaveBar } from '@/components/ui/saveBar';
import { StatusSelect } from '@/components/ui/statusSelect';
import { useDirtyStateGuard } from '@/components/ui/useDirtyStateGuard';

export function LocationCreateForm({
  slug,
  createAction,
}: {
  slug: string;
  createAction: (form: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const { markDirty, markClean, confirmDiscard } = useDirtyStateGuard();

  const cancelHref = `/projects/${slug}/workspace/locations`;
  const fieldErrors = result?.fieldErrors ?? {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await createAction(form);
      setResult(outcome);
      if (outcome.ok) {
        markClean();
        if (outcome.redirectTo) router.push(outcome.redirectTo);
      }
    });
  }

  function cancel() {
    if (!confirmDiscard()) return;
    router.push(cancelHref);
  }

  return (
    <form onChange={markDirty} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-label="Create location">
      <div className="sm:col-span-2">
        <ValidationSummary errors={fieldErrors} />
      </div>

      {result && !result.ok && !hasFieldErrors && (
        <div className="sm:col-span-2">
          <Notice tone="warning">
            {result.message}
            {result.code ? ` (${result.code})` : ''}
          </Notice>
        </div>
      )}

      <div className="sm:col-span-2">
        <Field label="Name">
          <input
            id="field-name"
            name="name"
            required
            maxLength={120}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'field-name-error' : undefined}
          />
        </Field>
        <FieldError id="field-name-error" message={fieldErrors.name} />
      </div>

      <div>
        <Field label="Type" hint="Defaults to “interior” if left blank.">
          <input
            id="field-type"
            name="type"
            maxLength={60}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.type)}
            aria-describedby={fieldErrors.type ? 'field-type-error' : undefined}
          />
        </Field>
        <FieldError id="field-type-error" message={fieldErrors.type} />
      </div>

      <div>
        <Field label="Era">
          <input
            id="field-era"
            name="era"
            maxLength={60}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.era)}
            aria-describedby={fieldErrors.era ? 'field-era-error' : undefined}
          />
        </Field>
        <FieldError id="field-era-error" message={fieldErrors.era} />
      </div>

      <FormSection title="Prompt" hint="Used only when this location is included in a compiled prompt.">
        <div>
          <Field label="Prompt block">
            <input
              id="field-promptBlock"
              name="promptBlock"
              maxLength={2000}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.promptBlock)}
              aria-describedby={fieldErrors.promptBlock ? 'field-promptBlock-error' : undefined}
            />
          </Field>
          <FieldError id="field-promptBlock-error" message={fieldErrors.promptBlock} />
        </div>
        <div>
          <Field label="Negative prompt">
            <input
              id="field-negativePrompt"
              name="negativePrompt"
              maxLength={2000}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.negativePrompt)}
              aria-describedby={fieldErrors.negativePrompt ? 'field-negativePrompt-error' : undefined}
            />
          </Field>
          <FieldError id="field-negativePrompt-error" message={fieldErrors.negativePrompt} />
        </div>
        <div>
          <Field label="Status">
            <StatusSelect
              id="field-status"
              name="status"
              defaultValue="draft"
              options={BIBLE_STATUSES}
              ariaInvalid={Boolean(fieldErrors.status)}
              ariaDescribedBy={fieldErrors.status ? 'field-status-error' : undefined}
            />
          </Field>
          <FieldError id="field-status-error" message={fieldErrors.status} />
        </div>
      </FormSection>

      <div className="sm:col-span-2">
        <SaveBar
          pending={pending}
          idleLabel="Create location"
          savingLabel="Creating…"
          onCancel={cancel}
          status={result?.ok ? result.message : undefined}
        />
      </div>
    </form>
  );
}
