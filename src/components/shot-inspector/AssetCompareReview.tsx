'use client';

import { useState } from 'react';
import { ActionButton } from '@/components/ActionButton';
import { Badge, Card, EmptyState, StatusBadge } from '@/components/ui';
import type { ActionResult } from '@/app/actions';

export interface AssetCompareCandidate {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  version: number;
  checksum: string;
  approvalState: 'pending' | 'approved' | 'rejected';
  generation: {
    id: string;
    provider: string;
    model: string;
    actualCostUsd: number;
    promptId: string | null;
    promptVersion: number | null;
  } | null;
  prompt: { id: string; version: number; lintOk: boolean | null; blockingFindingCount: number } | null;
  quality: { id: string; score: number; passed: boolean; createdAt: string } | null;
  approval: { decision: string; note: string; decidedBy: string | null; createdAt: string } | null;
  lineageHref: string;
  approveAction: () => Promise<ActionResult>;
  rejectAction: () => Promise<ActionResult>;
  qualityAction: () => Promise<ActionResult>;
}

function Preview({ candidate }: { candidate: AssetCompareCandidate }) {
  if (candidate.mimeType.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={candidate.url} alt={candidate.name} className="h-56 w-full rounded border border-line bg-surface-2 object-contain" />;
  }
  if (candidate.mimeType.startsWith('audio/')) {
    return <audio controls src={candidate.url} className="w-full" aria-label={`Preview ${candidate.name}`} />;
  }
  if (candidate.mimeType.startsWith('video/')) {
    return <video controls src={candidate.url} className="h-56 w-full rounded border border-line bg-surface-2 object-contain" aria-label={`Preview ${candidate.name}`} />;
  }
  return <div className="flex h-56 items-center justify-center rounded border border-line bg-surface-2 text-xs text-ink-lo">{candidate.mimeType}</div>;
}

export function CandidatePanel({ candidate }: { candidate: AssetCompareCandidate }) {
  const approvalReady = Boolean(
    candidate.quality && (!candidate.generation || (candidate.prompt && candidate.prompt.blockingFindingCount === 0)),
  );

  return (
    <article className="min-w-0 rounded-lg border border-line bg-surface-1 p-4" aria-label={`Review ${candidate.name}`}>
      <Preview candidate={candidate} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={candidate.approvalState} />
        <Badge>{candidate.kind}</Badge>
        <span className="font-mono text-xs text-ink-lo">v{candidate.version}</span>
      </div>
      <h3 className="mt-2 break-words text-sm font-medium text-ink-hi">{candidate.name}</h3>
      <p className="mt-1 break-all font-mono text-xs text-ink-lo" title={candidate.id}>Asset {candidate.id}</p>

      <dl className="mt-3 grid grid-cols-[max-content,minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-ink-lo">Generation</dt>
        <dd className="break-all font-mono text-ink-mid">{candidate.generation?.id ?? 'Manual / no generation'}</dd>
        <dt className="text-ink-lo">Provider / model</dt>
        <dd className="break-words font-mono text-ink-mid">
          {candidate.generation ? `${candidate.generation.provider}/${candidate.generation.model}` : 'Not applicable'}
        </dd>
        <dt className="text-ink-lo">Actual cost</dt>
        <dd className="text-ink-mid">{candidate.generation ? `$${candidate.generation.actualCostUsd.toFixed(4)}` : 'Not applicable'}</dd>
        <dt className="text-ink-lo">Pinned prompt</dt>
        <dd className="break-all font-mono text-ink-mid">
          {candidate.prompt ? `${candidate.prompt.id} v${candidate.prompt.version}` : 'No generation-pinned prompt'}
        </dd>
        <dt className="text-ink-lo">Prompt lint</dt>
        <dd className="text-ink-mid">
          {candidate.prompt
            ? candidate.prompt.blockingFindingCount === 0 && candidate.prompt.lintOk !== null
              ? 'Clean — 0 blocking findings'
              : `${candidate.prompt.blockingFindingCount} blocking finding(s)`
            : 'Unavailable'}
        </dd>
        <dt className="text-ink-lo">Quality</dt>
        <dd className="text-ink-mid">
          {candidate.quality
            ? `${candidate.quality.passed ? 'Passed' : 'Needs attention'} · ${candidate.quality.score}/100 · ${candidate.quality.createdAt}`
            : 'Not checked'}
        </dd>
        <dt className="text-ink-lo">Decision</dt>
        <dd className="break-words text-ink-mid">
          {candidate.approval
            ? `${candidate.approval.decision} · ${candidate.approval.decidedBy ?? 'local operator'} · ${candidate.approval.createdAt}${candidate.approval.note ? ` · ${candidate.approval.note}` : ''}`
            : 'No recorded decision'}
        </dd>
        <dt className="text-ink-lo">Checksum</dt>
        <dd className="truncate font-mono text-ink-mid" title={candidate.checksum}>{candidate.checksum}</dd>
      </dl>

      <a href={candidate.lineageHref} className="mt-3 inline-block text-xs text-brand hover:underline">Lineage →</a>

      {candidate.approvalState === 'approved' ? (
        <p className="mt-3 text-xs text-ink-lo">Approved assets are immutable; no destructive review controls are available.</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <ActionButton action={candidate.qualityAction} label="Run QC" pendingLabel="Checking…" variant="ghost" />
          <ActionButton
            action={candidate.approveAction}
            label="Approve"
            pendingLabel="Approving…"
            disabled={!approvalReady}
          />
          <ActionButton
            action={candidate.rejectAction}
            label="Reject"
            pendingLabel="Rejecting…"
            variant="danger"
            confirm={`Reject ${candidate.name}? The decision is recorded against this exact asset.`}
          />
          {!approvalReady && (
            <p className="basis-full text-xs text-ink-lo">
              Approval unlocks only after QC has run on this exact asset and its generation-pinned prompt has no blocking lint findings.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function toggleComparisonSelection(current: string[], id: string, limit = 2): string[] {
  if (current.includes(id)) return current.filter((candidateId) => candidateId !== id);
  if (current.length >= limit) return current;
  return [...current, id];
}

export function AssetCompareReview({ candidates }: { candidates: AssetCompareCandidate[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = selectedIds
    .map((id) => candidates.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is AssetCompareCandidate => Boolean(candidate));

  const toggle = (id: string): void => {
    setSelectedIds((current) => toggleComparisonSelection(current, id));
  };

  return (
    <Card title="Compare / review">
      {candidates.length === 0 ? (
        <EmptyState title="No candidates to compare" hint="Queue and complete a generation for this shot first." />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-ink-mid">Select up to two real assets. Selection is temporary and resets when you leave or reload.</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Comparison candidates">
              {candidates.map((candidate) => {
                const checked = selectedIds.includes(candidate.id);
                const disabled = !checked && selectedIds.length >= 2;
                return (
                  <label key={candidate.id} className="inline-flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink-hi">
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(candidate.id)} />
                    <span className="max-w-56">
                      <span className="block truncate">{candidate.name}</span>
                      <span className="block truncate font-mono text-xs text-ink-lo">Asset {candidate.id}</span>
                    </span>
                    <StatusBadge status={candidate.approvalState} />
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-lo" role="status">{selected.length}/2 candidates selected.</p>
          </div>

          {selected.length === 0 ? (
            <EmptyState title="Select one or two candidates" hint="The comparison panels show exact provenance, QC and approval evidence." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {selected.map((candidate) => <CandidatePanel key={candidate.id} candidate={candidate} />)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
