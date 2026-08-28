'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import {
  decidePromptVersionAction,
  getPromptApprovalStateAction,
} from '@/app/promptApprovalActions';
import type { PromptApprovalReviewState } from '@/application/services/promptApprovalService';
import type { ApprovalDecisions } from '@/domain/enums';

export function PromptApprovalControls({ kind }: { kind: 'image' | 'video' }) {
  const params = useParams<{ slug: string; code: string }>();
  const [state, setState] = useState<PromptApprovalReviewState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  const slug = decodeURIComponent(params?.slug ?? '');
  const shotCode = decodeURIComponent(params?.code ?? '');
  const hasRouteIdentity = slug.length > 0 && shotCode.length > 0;

  const reload = useCallback(async () => {
    if (!hasRouteIdentity) {
      setLoaded(true);
      setState(null);
      setMessage('');
      return;
    }
    const result = await getPromptApprovalStateAction(slug, shotCode, kind);
    setLoaded(true);
    if (!result.ok) {
      setMessage(result.message);
      setState(null);
      return;
    }
    setMessage('');
    setState(result.state ?? null);
  }, [hasRouteIdentity, kind, shotCode, slug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = (decision: ApprovalDecisions) => {
    if (!state || !hasRouteIdentity) return;
    startTransition(async () => {
      const result = await decidePromptVersionAction(slug, shotCode, kind, state.version, decision, note);
      setMessage(result.message);
      if (result.ok) {
        setNote('');
        await reload();
      }
    });
  };

  const title = kind === 'image' ? 'Image prompt approval' : 'Video prompt approval';

  return (
    <section className="rounded-lg border border-line bg-surface-1 p-3" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-lo">{title}</h4>
        {state && <span className="font-mono text-xs text-ink-mid">v{state.version}</span>}
      </div>

      {!loaded ? (
        <p className="mt-2 text-xs text-ink-lo">Loading approval evidence…</p>
      ) : !state ? (
        <p className="mt-2 text-xs text-ink-lo">No persisted {kind} prompt version is available to review.</p>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="text-xs">
            {state.latest ? (
              <p className="text-ink-hi">
                Latest exact-version decision: <strong>{state.latest.decision}</strong>
                <span className="text-ink-lo"> · {new Date(state.latest.createdAt).toLocaleString()}</span>
              </p>
            ) : state.stalePrior ? (
              <p className="text-amber-700 dark:text-amber-300">
                Current v{state.version} is unreviewed. Prior {state.stalePrior.decision.decision} decision on v{state.stalePrior.version} is stale evidence only.
              </p>
            ) : (
              <p className="text-ink-mid">No decision recorded for this exact version.</p>
            )}
            <p className="mt-1 text-ink-lo">{state.history.length} decision record(s) retained for this exact version.</p>
          </div>

          <label className="block text-xs text-ink-mid">
            Review note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={2}
              className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-hi"
              placeholder="Optional audit note"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => decide('approved')} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-hi disabled:opacity-50">Approve</button>
            <button type="button" disabled={pending} onClick={() => decide('rejected')} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-hi disabled:opacity-50">Reject</button>
            <button type="button" disabled={pending} onClick={() => decide('changes-requested')} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-hi disabled:opacity-50">Request changes</button>
          </div>
        </div>
      )}

      {message && <p className="mt-2 text-xs text-ink-mid" role="status">{message}</p>}
      <p className="mt-2 text-[11px] leading-4 text-ink-lo">Prompt approval records review evidence only. They do not authorize generation, execution adapters, export, or budget reservation.</p>
    </section>
  );
}
