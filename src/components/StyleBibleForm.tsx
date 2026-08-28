'use client';

/**
 * Style bible editing (TASK-009). Saving always writes the next immutable
 * `STYnnn_Vn` snapshot (rule 6).
 *
 * `promptBlock` is the only prompt-facing field exposed here, same reasoning
 * as locations: `styleLockText()` uses it as a full override of `details.*`
 * whenever it's non-empty, and the read-only view already treats it as the
 * primary content. The nineteen `details.*` fields stay reachable only by a
 * raw API call (see TASK-009's "Field scope" note).
 */
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import type { StyleRecord } from '@/application/records';
import { STYLE_CATEGORIES } from '@/domain/enums';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import { Badge, Button, ErrorState, Field, Notice, StatusBadge, inputClass } from './ui';

export function StyleBibleCard({
  style,
  isProjectDefault,
  slug,
  updateAction,
}: {
  style: StyleRecord;
  isProjectDefault: boolean;
  slug: string;
  updateAction: (styleId: string, form: FormData) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await updateAction(style.id, form);
      setResult(outcome);
      if (outcome.ok) setEditing(false);
    });
  };

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-lo">{style.code}</span>
        <span className="text-sm font-medium text-ink-hi">{style.name}</span>
        <Badge>{formatSnapshotId(style.code, style.currentVersion)}</Badge>
        <Badge>{style.category}</Badge>
        <StatusBadge status={style.status} />
        {isProjectDefault && <Badge>project default</Badge>}
        <a
          href={`/projects/${slug}/bibles/style/${style.id}/history`}
          className="text-xs font-medium text-blue-500 hover:underline ml-auto"
        >
          History
        </a>
        <Button type="button" variant="ghost" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Cancel' : 'Edit'}
        </Button>
      </div>

      {!editing ? (
        <>
          <p className="mt-2 text-xs text-ink-mid">{style.promptBlock}</p>
          {style.negativeStyleRules && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-400">Never: {style.negativeStyleRules}</p>
          )}
        </>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={`Edit ${style.name}`}>
          <Field label="Name">
            <input name="name" defaultValue={style.name} required maxLength={140} className={inputClass} />
          </Field>
          <Field label="Category">
            <select name="category" defaultValue={style.category} className={inputClass}>
              {STYLE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={style.status} className={inputClass}>
              <option value="draft">draft</option>
              <option value="approved">approved</option>
              <option value="locked">locked</option>
            </select>
          </Field>
          <div />
          <Field label="Prompt block" hint="Overrides every structured detail when set.">
            <textarea name="promptBlock" defaultValue={style.promptBlock} rows={3} className={inputClass} />
          </Field>
          <Field label="Negative style rules">
            <textarea name="negativeStyleRules" defaultValue={style.negativeStyleRules} rows={3} className={inputClass} />
          </Field>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? 'Saving…' : `Save (creates ${formatSnapshotId(style.code, style.currentVersion + 1)})`}
            </Button>
          </div>
        </form>
      )}

      {result && !result.ok && <ErrorState title="Could not save" detail={`${result.message} (${result.code ?? ''})`} />}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}
    </li>
  );
}
