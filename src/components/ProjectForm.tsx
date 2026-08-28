'use client';

/** Create-project form. Validation errors render next to the form, not as a page. */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import { PRODUCTION_TYPES } from '@/domain/enums';
import { Button, ErrorState, Field, inputClass } from './ui';

export function ProjectForm({
  action,
  presets,
}: {
  action: (form: FormData) => Promise<ActionResult>;
  presets: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionResult | null>(null);

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await action(form);
          if (result.ok && result.redirectTo) {
            router.push(result.redirectTo);
          } else if (!result.ok) {
            setError(result);
          }
        });
      }}
    >
      {error && (
        <div className="md:col-span-2">
          <ErrorState title="Could not create the project" detail={`${error.message}${error.code ? ` (${error.code})` : ''}`} />
        </div>
      )}

      <div className="md:col-span-2">
        <Field label="Title" hint="Used for the project slug and every export filename.">
          <input name="title" required maxLength={160} className={inputClass} placeholder="Triệu Ngốc — Tập 02" />
        </Field>
      </div>

      <div className="md:col-span-2">
        <Field label="Description">
          <textarea name="description" rows={2} className={inputClass} />
        </Field>
      </div>

      <Field label="Genre">
        <input name="genre" className={inputClass} placeholder="Hài, tiên hiệp" />
      </Field>

      <Field label="Format">
        <select name="format" className={inputClass} defaultValue="series">
          {['short-film', 'series', 'commercial', 'ugc', 'motion-comic', 'explainer', 'music-video', 'trailer'].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </Field>

      <Field label="Production Type">
        <select name="productionType" className={inputClass} required defaultValue="cinematic-short-film">
          {PRODUCTION_TYPES.map((value: string) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Platform">
        <select name="platform" className={inputClass} defaultValue="youtube">
          {['youtube', 'tiktok', 'shorts', 'reels', 'facebook', 'website', 'tv', 'internal'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Master aspect ratio">
        <select name="aspectRatio" className={inputClass} defaultValue="16:9">
          {['16:9', '9:16', '1:1', '4:5', '2.39:1', '21:9', '3:2'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Target duration (seconds)">
        <input name="durationTargetSeconds" type="number" min={5} max={36000} defaultValue={300} className={inputClass} />
      </Field>

      <Field label="Cost ceiling (USD)" hint="Generations that would cross this are refused.">
        <input name="costLimitUsd" type="number" min={0} step="0.5" defaultValue={25} className={inputClass} />
      </Field>

      <div className="md:col-span-2">
        <Field label="Style preset" hint="Becomes the project's first Style Bible entry. Attributes only — no studio names.">
          <select name="stylePresetKey" className={inputClass} defaultValue={presets[0]?.key}>
            {presets.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="md:col-span-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Creating…' : 'Create project'}
        </Button>
      </div>
    </form>
  );
}
