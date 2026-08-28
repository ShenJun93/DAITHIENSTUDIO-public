'use client';

/**
 * Location bible editing (TASK-009). Saving always writes the next
 * immutable `LOCnnn_Vn` snapshot (rule 6).
 *
 * `promptBlock` is deliberately the only prompt-facing field exposed here:
 * `locationLockText()` uses it as a full override of `details.*` whenever
 * it's non-empty, and the read-only view already treated it as the primary
 * content — the eleven `details.*` fields stay reachable only by a raw API
 * call (see TASK-009's "Field scope" note).
 */
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import type { LocationRecord } from '@/application/records';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import { Badge, Button, ErrorState, Field, Notice, StatusBadge, inputClass } from './ui';

const join = (values: string[]): string => values.join(', ');

export function LocationBibleCard({
  location,
  slug,
  updateAction,
}: {
  location: LocationRecord;
  slug: string;
  updateAction: (locationId: string, form: FormData) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await updateAction(location.id, form);
      setResult(outcome);
      if (outcome.ok) setEditing(false);
    });
  };

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-lo">{location.code}</span>
        <span className="text-sm font-medium text-ink-hi">{location.name}</span>
        <Badge>{formatSnapshotId(location.code, location.currentVersion)}</Badge>
        <StatusBadge status={location.status} />
        <a
          href={`/projects/${slug}/bibles/location/${location.id}/history`}
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
          <p className="mt-2 text-xs text-ink-mid">
            {location.type} · {location.era || 'era unset'}
          </p>
          {location.promptBlock && <p className="mt-1 text-xs text-ink-mid">{location.promptBlock}</p>}
          {location.continuityNotes && (
            <p className="mt-1 text-xs text-ink-lo">Continuity: {location.continuityNotes}</p>
          )}
        </>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={`Edit ${location.name}`}>
          <Field label="Name">
            <input name="name" defaultValue={location.name} required maxLength={120} className={inputClass} />
          </Field>
          <Field label="Type">
            <input name="type" defaultValue={location.type} maxLength={60} className={inputClass} />
          </Field>
          <Field label="Era">
            <input name="era" defaultValue={location.era} maxLength={60} className={inputClass} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={location.status} className={inputClass}>
              <option value="draft">draft</option>
              <option value="approved">approved</option>
              <option value="locked">locked</option>
            </select>
          </Field>
          <Field label="Prompt block" hint="Overrides every structured detail when set.">
            <textarea name="promptBlock" defaultValue={location.promptBlock} rows={3} className={inputClass} />
          </Field>
          <Field label="Negative prompt">
            <input name="negativePrompt" defaultValue={location.negativePrompt} maxLength={2000} className={inputClass} />
          </Field>
          <Field label="Color palette" hint="Comma-separated hex codes.">
            <input name="colorPalette" defaultValue={join(location.colorPalette)} className={inputClass} />
          </Field>
          <Field label="Continuity notes">
            <input name="continuityNotes" defaultValue={location.continuityNotes} maxLength={2000} className={inputClass} />
          </Field>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? 'Saving…' : `Save (creates ${formatSnapshotId(location.code, location.currentVersion + 1)})`}
            </Button>
          </div>
        </form>
      )}

      {result && !result.ok && <ErrorState title="Could not save" detail={`${result.message} (${result.code ?? ''})`} />}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}
    </li>
  );
}
