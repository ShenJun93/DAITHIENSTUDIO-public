import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionButton } from '@/components/ActionButton';
import { StatusBadge } from '@/components/ui';
import type { ActionResult } from '@/app/actions';

export interface ShotInspectorHeaderProps {
  shotCode: string;
  shotTitle: string | null;
  sceneCode: string | null;
  importance: string;
  status: string;
  projectSlug: string;
  previousShotCode: string | null;
  nextShotCode: string | null;
  deleteAction: () => Promise<ActionResult>;
  confirmMessage: string;
  readinessPlaceholder?: ReactNode;
}

export function ShotInspectorHeader({
  shotCode,
  shotTitle,
  sceneCode,
  importance,
  status,
  projectSlug,
  previousShotCode,
  nextShotCode,
  deleteAction,
  confirmMessage,
  readinessPlaceholder,
}: ShotInspectorHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-mono text-xl font-semibold text-ink-hi">{shotCode}</h1>
        <p className="text-sm text-ink-mid">
          {shotTitle || '(untitled shot)'} · scene {sceneCode ?? '—'} ·{' '}
          {importance === 'key' ? 'key shot' : 'normal shot'}
        </p>
        {readinessPlaceholder}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        <div className="flex items-center gap-1.5">
          {previousShotCode ? (
            <Link
              href={`/projects/${projectSlug}/shots/${encodeURIComponent(previousShotCode)}`}
              className="rounded border border-line px-2 py-1 text-sm text-ink-mid hover:bg-surface-2 hover:text-ink-hi"
              aria-label={`Previous shot: ${previousShotCode}`}
            >
              ← Prev
            </Link>
          ) : (
            <span className="rounded border border-line px-2 py-1 text-sm text-ink-lo" aria-hidden="true">
              ← Prev
            </span>
          )}
          {nextShotCode ? (
            <Link
              href={`/projects/${projectSlug}/shots/${encodeURIComponent(nextShotCode)}`}
              className="rounded border border-line px-2 py-1 text-sm text-ink-mid hover:bg-surface-2 hover:text-ink-hi"
              aria-label={`Next shot: ${nextShotCode}`}
            >
              Next →
            </Link>
          ) : (
            <span className="rounded border border-line px-2 py-1 text-sm text-ink-lo" aria-hidden="true">
              Next →
            </span>
          )}
        </div>
        <Link href={`/projects/${projectSlug}/shots`} className="text-sm text-brand hover:underline">
          ← Shot list
        </Link>
        <Link
          href={`/projects/${projectSlug}/shots/${encodeURIComponent(shotCode)}/edit`}
          className="text-sm text-brand hover:underline"
        >
          Edit shot
        </Link>
        <span className="border-l border-line pl-2">
          <ActionButton
            action={deleteAction}
            label="Delete shot"
            pendingLabel="Deleting…"
            variant="danger"
            confirm={confirmMessage}
          />
        </span>
      </div>
    </header>
  );
}
