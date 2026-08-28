'use client';

/**
 * Character creation (TASK-UI-CORE-EDITORS-001 Slice 1). Calls the existing,
 * unchanged bibleService.createCharacter through createCharacterAction — no
 * new service method, no schema change. Only a deliberately compact subset
 * of characterInputSchema is exposed here (name, role, promptToken,
 * negativePrompt, status, lockEnabled); the full identity/variable detail
 * fields stay reachable at the existing, unchanged /projects/[slug]/bibles
 * update form immediately after creation. `code` is never exposed — it is
 * always server-assigned via bibles.nextCode.
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

export function CharacterCreateForm({
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

  const cancelHref = `/projects/${slug}/workspace/characters`;
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
    <form onChange={markDirty} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-label="Create character">
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
        <Field label="Role" hint="Defaults to “supporting” if left blank.">
          <input
            id="field-role"
            name="role"
            maxLength={60}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.role)}
            aria-describedby={fieldErrors.role ? 'field-role-error' : undefined}
          />
        </Field>
        <FieldError id="field-role-error" message={fieldErrors.role} />
      </div>

      <FormSection title="Prompt &amp; lock" hint="Used only when this character is included in a compiled prompt.">
        <div>
          <Field label="Prompt token" hint="Falls back to the name if blank.">
            <input
              id="field-promptToken"
              name="promptToken"
              maxLength={400}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.promptToken)}
              aria-describedby={fieldErrors.promptToken ? 'field-promptToken-error' : undefined}
            />
          </Field>
          <FieldError id="field-promptToken-error" message={fieldErrors.promptToken} />
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
        <div>
          <Field
            label="Lock"
            hint="Advisory only — controls whether this character is included in the Character Lock prompt block. It never blocks editing this record."
          >
            <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-hi">
              <input
                id="field-lockEnabled"
                type="checkbox"
                name="lockEnabled"
                defaultChecked
                aria-invalid={Boolean(fieldErrors.lockEnabled)}
                aria-describedby={fieldErrors.lockEnabled ? 'field-lockEnabled-error' : undefined}
              />
              <span>Enforce Character Lock in prompts</span>
            </div>
          </Field>
          <FieldError id="field-lockEnabled-error" message={fieldErrors.lockEnabled} />
        </div>
      </FormSection>

      <div className="sm:col-span-2">
        <SaveBar
          pending={pending}
          idleLabel="Create character"
          savingLabel="Creating…"
          onCancel={cancel}
          status={result?.ok ? result.message : undefined}
        />
      </div>
    </form>
  );
}
