'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { composeVideoAction } from '@/app/actions';
import type { ActionResult } from '@/app/actions';
import { Button } from '@/components/ui';

export function ComposeVideoForm({ slug }: { slug: string }) {
  const [resolution, setResolution] = useState('1920x1080');
  const [fps, setFps] = useState(24);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const actionResult = await composeVideoAction(slug, resolution, fps);
      setResult(actionResult);
      if (actionResult.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4" aria-label="Compose final video">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-ink-lo">Resolution</span>
          <select
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            disabled={pending}
            className="mt-1 block w-full rounded-md border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-hi"
          >
            <option value="1920x1080">1920x1080 (Landscape)</option>
            <option value="1080x1920">1080x1920 (Portrait)</option>
            <option value="1080x1080">1080x1080 (Square)</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-ink-lo">FPS</span>
          <select
            value={fps}
            onChange={(event) => setFps(Number(event.target.value))}
            disabled={pending}
            className="mt-1 block w-full rounded-md border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-hi"
          >
            <option value={24}>24 fps</option>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </label>
      </div>

      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Composing…' : 'Compose Final Video'}
        </Button>
      </div>

      {result && (
        <div
          role={result.ok ? 'status' : 'alert'}
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-sm ${
            result.ok
              ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-200'
              : 'border-red-500/50 bg-red-950/40 text-red-200'
          }`}
        >
          <p>
            {result.message}
            {result.code && !result.ok ? ` (${result.code})` : ''}
          </p>
        </div>
      )}

      {result?.ok && result.resultUrl && (
        <div className="space-y-2">
          <video
            controls
            preload="metadata"
            src={result.resultUrl}
            className="aspect-video w-full rounded-md border border-line bg-black"
            aria-label="Composed final video preview"
          />
          {result.downloadUrl && (
            <a href={result.downloadUrl} className="inline-flex text-sm font-medium text-brand hover:underline">
              Download final MP4
            </a>
          )}
        </div>
      )}
    </form>
  );
}
