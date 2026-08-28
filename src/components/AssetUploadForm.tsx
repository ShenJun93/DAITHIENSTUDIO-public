'use client';

/** Manual asset upload — reference art, plates, hand-painted keyframes. */
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import { ASSET_KINDS } from '@/domain/enums';
import { Button, ErrorState, Field, Notice, inputClass } from './ui';

export function AssetUploadForm({
  shots,
  uploadAction,
  bindingTargets = [],
}: {
  shots: { id: string; code: string }[];
  uploadAction: (form: FormData) => Promise<ActionResult>;
  bindingTargets?: { value: string; label: string }[];
}) {
  const [fileName, setFileName] = useState('');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setResult(null);
    startTransition(async () => {
      const outcome = await uploadAction(form);
      setResult(outcome);
      if (outcome.ok) {
        formEl.reset();
        setFileName('');
      }
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-4" aria-label="Upload asset">
      <Field label="File">
        <input
          name="file"
          type="file"
          required
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
          className={`${inputClass} py-1`}
        />
      </Field>
      <Field label="Kind">
        <select name="kind" defaultValue="image" className={inputClass}>
          {ASSET_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name" hint="Defaults to the file name.">
        <input name="name" maxLength={200} placeholder={fileName || 'asset name'} className={inputClass} />
      </Field>
      <Field label="Shot (optional)">
        <select name="shotId" defaultValue="" className={inputClass}>
          <option value="">— none —</option>
          {shots.map((shot) => (
            <option key={shot.id} value={shot.id}>
              {shot.code}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tags" hint="Comma-separated.">
        <input name="tags" className={inputClass} placeholder="reference, plate" />
      </Field>
      {bindingTargets.length > 0 && (
        <>
          <Field label="Production target" hint="Pins this file to one exact Bible version or shot.">
            <select name="bindingTarget" required defaultValue="" className={inputClass}>
              <option value="" disabled>Choose a versioned target</option>
              {bindingTargets.map((target) => (
                <option key={target.value} value={target.value}>{target.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Source tool" hint="Where the file was made.">
            <input name="originTool" maxLength={120} className={inputClass} placeholder="Editor, image service, artist…" />
          </Field>
          <Field label="Source model" hint="Optional model or workflow name.">
            <input name="originModel" maxLength={160} className={inputClass} placeholder="Model / checkpoint / workflow" />
          </Field>
          <Field label="Usage rights" hint="Keep licensing evidence with the asset.">
            <input name="usageRights" maxLength={300} className={inputClass} placeholder="Owned, commissioned, licensed…" />
          </Field>
        </>
      )}
      <div className="flex items-end sm:col-span-4">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Uploading…' : 'Upload'}
        </Button>
      </div>

      {result && !result.ok && (
        <div className="sm:col-span-4">
          <ErrorState title="Upload failed" detail={`${result.message} (${result.code ?? ''})`} />
        </div>
      )}
      {result?.ok && (
        <div className="sm:col-span-4">
          <Notice tone="success">{result.message}</Notice>
        </div>
      )}
    </form>
  );
}
