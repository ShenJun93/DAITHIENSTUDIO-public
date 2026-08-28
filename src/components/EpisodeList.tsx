'use client';

/**
 * Episode list + inline update/delete (TASK-UI-CORE-EDITORS-001 Episode UI
 * migration). Calls the existing, unchanged updateEpisodeAction/
 * deleteEpisodeAction -> episodeService.updateEpisode/deleteEpisode — no new
 * service method, no schema change, no new route. Each episode's disclosure
 * now owns its own pending/result/dirty state (previously one shared
 * pending/result state covered every episode in the list, so saving one
 * episode visually disabled every other episode's Save button at the same
 * time) — standardizing onto the same per-instance pending/result pattern
 * every other migrated form in this task already uses, not a new capability.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEpisodeAction, updateEpisodeAction, type ActionResult } from '@/app/actions';
import { Button, Notice } from '@/components/ui';
import { FormSection } from '@/components/ui/formSection';
import { FieldError, ValidationSummary } from '@/components/ui/validationSummary';
import { SaveBar } from '@/components/ui/saveBar';
import { StatusSelect } from '@/components/ui/statusSelect';
import { useDirtyStateGuard } from '@/components/ui/useDirtyStateGuard';

const EPISODE_STATUS_OPTIONS = ['draft', 'in-production', 'completed'] as const;
const EPISODE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  'in-production': 'In production',
  completed: 'Completed',
};

interface Episode {
  id: string;
  code: string;
  title: string;
  synopsis: string;
  status: string;
}

function EpisodeRow({
  slug,
  episode,
  isActive,
  canDelete,
}: {
  slug: string;
  episode: Episode;
  isActive: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const { markDirty, markClean } = useDirtyStateGuard();

  const fieldErrors = result?.fieldErrors ?? {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await updateEpisodeAction(slug, episode.id, form);
      setResult(outcome);
      if (outcome.ok) {
        markClean();
        router.refresh();
      }
    });
  }

  function remove() {
    if (pending) return;
    setResult(null);
    startTransition(async () => {
      const outcome = await deleteEpisodeAction(slug, episode.id);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <details
      className={`rounded-md border p-2 ${
        isActive ? 'border-brand bg-brand/5' : 'border-line bg-surface-1'
      }`}
    >
      <summary className="cursor-pointer text-sm font-medium text-ink-hi">
        {episode.code} · {episode.title}
        {isActive && <span className="ml-2 text-xs text-brand">Active</span>}
      </summary>

      <form onChange={markDirty} onSubmit={submit} className="mt-3 grid gap-3" aria-label={`Edit episode ${episode.code}`}>
        <ValidationSummary errors={fieldErrors} hrefSuffix={`-${episode.id}`} />

        {result && !result.ok && !hasFieldErrors && (
          <Notice tone="warning">
            {result.message}
            {result.code ? ` (${result.code})` : ''}
          </Notice>
        )}

        <div>
          <label className="grid gap-1 text-xs text-ink-mid" htmlFor={`field-title-${episode.id}`}>
            Title
            <input
              id={`field-title-${episode.id}`}
              name="title"
              required
              maxLength={160}
              defaultValue={episode.title}
              className="rounded border border-line bg-surface-1 px-2 py-1 text-sm text-ink-hi"
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? `field-title-${episode.id}-error` : undefined}
            />
          </label>
          <FieldError id={`field-title-${episode.id}-error`} message={fieldErrors.title} />
        </div>

        <FormSection title="Details">
          <div>
            <label className="grid gap-1 text-xs text-ink-mid" htmlFor={`field-synopsis-${episode.id}`}>
              Synopsis
              <textarea
                id={`field-synopsis-${episode.id}`}
                name="synopsis"
                maxLength={4000}
                defaultValue={episode.synopsis}
                className="min-h-16 rounded border border-line bg-surface-1 px-2 py-1 text-sm text-ink-hi"
                aria-invalid={Boolean(fieldErrors.synopsis)}
                aria-describedby={fieldErrors.synopsis ? `field-synopsis-${episode.id}-error` : undefined}
              />
            </label>
            <FieldError id={`field-synopsis-${episode.id}-error`} message={fieldErrors.synopsis} />
          </div>
          <div>
            <label className="grid gap-1 text-xs text-ink-mid" htmlFor={`field-status-${episode.id}`}>
              Status
              <StatusSelect
                id={`field-status-${episode.id}`}
                name="status"
                defaultValue={episode.status}
                options={EPISODE_STATUS_OPTIONS}
                labels={EPISODE_STATUS_LABELS}
                className="rounded border border-line bg-surface-1 px-2 py-1 text-sm text-ink-hi"
                ariaInvalid={Boolean(fieldErrors.status)}
                ariaDescribedBy={fieldErrors.status ? `field-status-${episode.id}-error` : undefined}
              />
            </label>
            <FieldError id={`field-status-${episode.id}-error`} message={fieldErrors.status} />
          </div>
        </FormSection>

        <SaveBar
          pending={pending}
          idleLabel="Save episode"
          savingLabel="Saving…"
          status={result?.ok ? result.message : undefined}
        />
        {canDelete && (
          <div>
            <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
              Delete episode
            </Button>
          </div>
        )}
      </form>
    </details>
  );
}

export function EpisodeList({
  slug,
  episodes,
  activeEpisodeId,
}: {
  slug: string;
  episodes: Episode[];
  activeEpisodeId: string | null;
}) {
  return (
    <div className="space-y-2">
      {episodes.map((episode) => (
        <EpisodeRow
          key={episode.id}
          slug={slug}
          episode={episode}
          isActive={episode.id === activeEpisodeId}
          canDelete={episodes.length > 1}
        />
      ))}
    </div>
  );
}
