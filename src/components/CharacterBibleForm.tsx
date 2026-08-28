'use client';

/**
 * Character bible editing (TASK-008). Saving always writes the next
 * immutable `CHARnnn_Vn` snapshot — bible edits are insert-only by design
 * (rule 6), never a silent in-place overwrite.
 */
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import type { CharacterRecord } from '@/application/records';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import { Badge, Button, ErrorState, Field, Notice, StatusBadge, inputClass } from './ui';

const join = (values: string[]): string => values.join(', ');

export function CharacterBibleCard({
  character,
  slug,
  updateAction,
}: {
  character: CharacterRecord;
  slug: string;
  updateAction: (characterId: string, form: FormData) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await updateAction(character.id, form);
      setResult(outcome);
      if (outcome.ok) setEditing(false);
    });
  };

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-lo">{character.code}</span>
        <span className="text-sm font-medium text-ink-hi">{character.name}</span>
        <Badge>{formatSnapshotId(character.code, character.currentVersion)}</Badge>
        <StatusBadge status={character.status} />
        {character.lockEnabled && <Badge>lock on</Badge>}
        <a
          href={`/projects/${slug}/bibles/character/${character.id}/history`}
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
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-ink-lo">Identity (immutable)</dt>
              <dd className="text-ink-mid">
                {[
                  character.identity.ageRange,
                  character.identity.bodyType,
                  character.identity.hair,
                  character.identity.eyes,
                  ...(character.identity.distinguishingMarks ?? []),
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-lo">Wardrobe (variable)</dt>
              <dd className="text-ink-mid">
                {[character.variable.costume, ...(character.variable.accessories ?? [])].filter(Boolean).join(' · ') || '—'}
              </dd>
            </div>
          </dl>
          {character.forbiddenChanges.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              <span aria-hidden="true">⚠ </span>Never change: {character.forbiddenChanges.join('; ')}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {character.colorPalette.map((color) => (
              <span key={color} title={color} className="inline-block h-4 w-4 rounded border border-line" style={{ background: color }} />
            ))}
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={`Edit ${character.name}`}>
          <Field label="Name">
            <input name="name" defaultValue={character.name} required maxLength={120} className={inputClass} />
          </Field>
          <Field label="Role">
            <input name="role" defaultValue={character.role} maxLength={60} className={inputClass} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={character.status} className={inputClass}>
              <option value="draft">draft</option>
              <option value="approved">approved</option>
              <option value="locked">locked</option>
            </select>
          </Field>
          <Field label="Lock">
            <label className="mt-1.5 flex items-center gap-2 text-sm text-ink-hi">
              <input type="checkbox" name="lockEnabled" defaultChecked={character.lockEnabled} />
              Enforce Character Lock in prompts
            </label>
          </Field>
          <Field label="Prompt token" hint="Falls back to the name if blank.">
            <input name="promptToken" defaultValue={character.promptToken} maxLength={400} className={inputClass} />
          </Field>
          <Field label="Negative prompt">
            <input name="negativePrompt" defaultValue={character.negativePrompt} maxLength={2000} className={inputClass} />
          </Field>
          <Field label="Forbidden changes" hint="Comma-separated.">
            <input name="forbiddenChanges" defaultValue={join(character.forbiddenChanges)} className={inputClass} />
          </Field>
          <Field label="Color palette" hint="Comma-separated hex codes.">
            <input name="colorPalette" defaultValue={join(character.colorPalette)} className={inputClass} />
          </Field>

          <div className="text-xs font-medium uppercase tracking-wide text-ink-lo sm:col-span-2">
            Identity (should stay consistent across the whole story)
          </div>
          <Field label="Age range">
            <input name="ageRange" defaultValue={character.identity.ageRange} className={inputClass} />
          </Field>
          <Field label="Species">
            <input name="species" defaultValue={character.identity.species} className={inputClass} />
          </Field>
          <Field label="Gender presentation">
            <input name="genderPresentation" defaultValue={character.identity.genderPresentation} className={inputClass} />
          </Field>
          <Field label="Height">
            <input name="height" defaultValue={character.identity.height} className={inputClass} />
          </Field>
          <Field label="Body type">
            <input name="bodyType" defaultValue={character.identity.bodyType} className={inputClass} />
          </Field>
          <Field label="Face shape">
            <input name="faceShape" defaultValue={character.identity.faceShape} className={inputClass} />
          </Field>
          <Field label="Skin tone">
            <input name="skinTone" defaultValue={character.identity.skinTone} className={inputClass} />
          </Field>
          <Field label="Hair">
            <input name="hair" defaultValue={character.identity.hair} className={inputClass} />
          </Field>
          <Field label="Eyes">
            <input name="eyes" defaultValue={character.identity.eyes} className={inputClass} />
          </Field>
          <Field label="Distinguishing marks" hint="Comma-separated.">
            <input name="distinguishingMarks" defaultValue={join(character.identity.distinguishingMarks ?? [])} className={inputClass} />
          </Field>

          <div className="text-xs font-medium uppercase tracking-wide text-ink-lo sm:col-span-2">Wardrobe (can vary by scene)</div>
          <Field label="Costume">
            <input name="costume" defaultValue={character.variable.costume} className={inputClass} />
          </Field>
          <Field label="Accessories" hint="Comma-separated.">
            <input name="accessories" defaultValue={join(character.variable.accessories ?? [])} className={inputClass} />
          </Field>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? 'Saving…' : `Save (creates ${formatSnapshotId(character.code, character.currentVersion + 1)})`}
            </Button>
          </div>
        </form>
      )}

      {result && !result.ok && <ErrorState title="Could not save" detail={`${result.message} (${result.code ?? ''})`} />}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}
    </li>
  );
}
