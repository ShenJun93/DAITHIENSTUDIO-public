'use client';

/**
 * Episode create (TASK-UI-CORE-EDITORS-001 Episode UI migration). Calls the
 * existing, unchanged createEpisodeAction -> episodeService.createEpisode —
 * no new service method, no schema change, no new route. Only `title` is
 * exposed, exactly as before this migration; `synopsis` stays contract-
 * authorized but not exposed here, matching the pre-migration form and the
 * Character/Location Create precedent of not adding a field the prior UI
 * never exposed. `code`/`number` are always server-assigned and never
 * rendered as inputs.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEpisodeAction } from '@/app/actions';
import type { ActionResult } from '@/app/actions';
import { Field, Notice, inputClass } from '@/components/ui';
import { FieldError, ValidationSummary } from '@/components/ui/validationSummary';
import { SaveBar } from '@/components/ui/saveBar';
import { useDirtyStateGuard } from '@/components/ui/useDirtyStateGuard';

export function CreateEpisodeForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const { markDirty, markClean } = useDirtyStateGuard();

  const fieldErrors = result?.fieldErrors ?? {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append('title', title);
      const outcome = await createEpisodeAction(slug, fd);
      setResult(outcome);
      if (outcome.ok) {
        setTitle('');
        markClean();
        router.refresh();
      }
    });
  }

  return (
    <form
      onChange={markDirty}
      onSubmit={submit}
      className="grid gap-3"
      aria-label="Create episode"
    >
      <ValidationSummary errors={fieldErrors} />

      {result && !result.ok && !hasFieldErrors && (
        <Notice tone="warning">
          {result.message}
          {result.code ? ` (${result.code})` : ''}
        </Notice>
      )}

      <div>
        <Field label="New episode title">
          <input
            id="field-title"
            name="title"
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? 'field-title-error' : undefined}
          />
        </Field>
        <FieldError id="field-title-error" message={fieldErrors.title} />
      </div>

      <SaveBar
        pending={pending}
        idleLabel="Create episode"
        savingLabel="Creating…"
        status={result?.ok ? result.message : undefined}
      />
    </form>
  );
}
