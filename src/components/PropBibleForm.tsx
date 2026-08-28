'use client';

/**
 * Prop bible editing (TASK-009). Saving always writes the next immutable
 * `PROPnnn_Vn` snapshot (rule 6).
 *
 * Unlike location/style, props have no `promptBlock` override — `propLockText()`
 * reads `details.material/color/condition/dimensions` directly, so those four
 * are exposed here. `details.functionalBehavior`/`storyImportance` are
 * narrative-only (not read by `propLockText()`) and stay out of this form.
 */
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import type { CharacterRecord, PropRecord } from '@/application/records';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import { Badge, Button, ErrorState, Field, Notice, StatusBadge, inputClass } from './ui';

const join = (values: string[]): string => values.join(', ');

export function PropBibleCard({
  prop,
  characters,
  slug,
  updateAction,
}: {
  prop: PropRecord;
  characters: CharacterRecord[];
  slug: string;
  updateAction: (propId: string, form: FormData) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const owner = characters.find((character) => character.id === prop.ownerCharacterId);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await updateAction(prop.id, form);
      setResult(outcome);
      if (outcome.ok) setEditing(false);
    });
  };

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-lo">{prop.code}</span>
        <span className="text-sm font-medium text-ink-hi">{prop.name}</span>
        <Badge>{formatSnapshotId(prop.code, prop.currentVersion)}</Badge>
        <StatusBadge status={prop.status} />
        <a
          href={`/projects/${slug}/bibles/prop/${prop.id}/history`}
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
            {[prop.details.material, prop.details.color, prop.details.condition, prop.details.dimensions]
              .filter(Boolean)
              .join(' · ') || prop.description || '—'}
          </p>
          <p className="mt-1 text-xs text-ink-lo">Owner: {owner?.name ?? 'unowned'}</p>
          {prop.continuityConstraints.length > 0 && (
            <p className="mt-1 text-xs text-ink-lo">Constraints: {prop.continuityConstraints.join('; ')}</p>
          )}
        </>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={`Edit ${prop.name}`}>
          <Field label="Name">
            <input name="name" defaultValue={prop.name} required maxLength={120} className={inputClass} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={prop.status} className={inputClass}>
              <option value="draft">draft</option>
              <option value="approved">approved</option>
              <option value="locked">locked</option>
            </select>
          </Field>
          <Field label="Owner character">
            <select name="ownerCharacterId" defaultValue={prop.ownerCharacterId ?? ''} className={inputClass}>
              <option value="">— unowned —</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prompt token" hint="Falls back to the name if blank.">
            <input name="promptToken" defaultValue={prop.promptToken} maxLength={400} className={inputClass} />
          </Field>
          <Field label="Description">
            <input name="description" defaultValue={prop.description} maxLength={2000} className={inputClass} />
          </Field>
          <Field label="Continuity constraints" hint="Comma-separated.">
            <input name="continuityConstraints" defaultValue={join(prop.continuityConstraints)} className={inputClass} />
          </Field>

          <div className="text-xs font-medium uppercase tracking-wide text-ink-lo sm:col-span-2">
            Detail (what a compiled prompt actually sees)
          </div>
          <Field label="Material">
            <input name="material" defaultValue={prop.details.material} className={inputClass} />
          </Field>
          <Field label="Color">
            <input name="color" defaultValue={prop.details.color} className={inputClass} />
          </Field>
          <Field label="Condition">
            <input name="condition" defaultValue={prop.details.condition} className={inputClass} />
          </Field>
          <Field label="Dimensions">
            <input name="dimensions" defaultValue={prop.details.dimensions} className={inputClass} />
          </Field>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? 'Saving…' : `Save (creates ${formatSnapshotId(prop.code, prop.currentVersion + 1)})`}
            </Button>
          </div>
        </form>
      )}

      {result && !result.ok && <ErrorState title="Could not save" detail={`${result.message} (${result.code ?? ''})`} />}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}
    </li>
  );
}
