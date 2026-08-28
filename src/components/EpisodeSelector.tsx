'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveEpisodeAction } from '@/app/actions';

interface Episode {
  id: string;
  code: string;
  title: string;
}

export function EpisodeSelector({
  projectId,
  episodes,
  activeEpisodeId,
}: {
  projectId: string;
  episodes: Episode[];
  activeEpisodeId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    if (newId === activeEpisodeId) return;

    setResult(null);
    startTransition(async () => {
      const actionResult = await setActiveEpisodeAction(projectId, newId);
      setResult({ ok: actionResult.ok, message: actionResult.message });
      if (actionResult.ok) {
        // Only refresh the current route so layout can re-render
        router.refresh();
      }
    });
  }

  if (episodes.length <= 1) return null; // No need to show if only 1 episode exists

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label htmlFor="episode-selector" className="text-xs font-medium text-ink-mid">
        Episode:
      </label>
      <select
        id="episode-selector"
        value={activeEpisodeId}
        onChange={handleChange}
        disabled={isPending}
        aria-busy={isPending}
        aria-describedby={isPending || result ? 'episode-selector-status' : undefined}
        className="rounded border border-line bg-surface-1 px-2 py-1 text-sm text-ink-hi outline-none focus:border-brand disabled:opacity-50"
      >
        {episodes.map((ep) => (
          <option key={ep.id} value={ep.id}>
            {ep.code} — {ep.title}
          </option>
        ))}
      </select>
      {(isPending || result) && (
        <span
          id="episode-selector-status"
          role={result && !result.ok ? 'alert' : 'status'}
          aria-live="polite"
          className={`basis-full text-right text-xs ${result && !result.ok ? 'text-red-400' : 'text-ink-lo'}`}
        >
          {isPending ? 'Updating episode…' : result?.message}
        </span>
      )}
    </div>
  );
}
