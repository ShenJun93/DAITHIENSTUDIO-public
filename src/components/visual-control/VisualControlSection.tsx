/**
 * Visual Control section (VC2–VC8).
 *
 * The section consumes the accepted Visual Control read model. VC3 adds
 * bounded reference repinning; VC8 adds exact-package operator decisions while
 * keeping provider execution explicitly separate and unauthorized here.
 */
import type { VisualControlState } from '@/domain/visualControl/types';
import { deriveVisualPackageApprovalEligibility } from '@/domain/visualControl/packageApproval';
import {
  deriveReadinessEvidence,
  type CompletionState,
  type PinState,
  type ApprovalState,
  type ContinuityState,
  type ExecutionState,
  type EvidenceTone,
} from './readinessEvidence';
import { EvidenceStatusBadge, type EvidenceBadgeTone } from './EvidenceStatusBadge';
import { VisualSpecSummary } from './VisualSpecSummary';
import { PinnedReferencesSummary } from './PinnedReferencesSummary';
import { ProjectStyleReview } from './ProjectStyleReview';
import { PromptReviewSummary } from './PromptReviewSummary';
import { AssetReviewSummary } from './AssetReviewSummary';
import { VisualContinuityPanel } from './VisualContinuityPanel';
import { PackageSummary } from './PackageSummary';
import { VisualPackageApprovalControls } from './VisualPackageApprovalControls';
import type { RepinData } from './visualControlRepin';

const EVIDENCE_LABEL: Record<string, string> = {
  empty: 'No evidence',
  partial: 'Evidence partial',
  complete: 'Evidence complete',
  'all-pinned': 'All pinned',
  unresolved: 'Unresolved pin',
  approved: 'References approved',
  'missing-approval': 'Approval pending',
  blocked: 'Continuity blocked',
  finding: 'Continuity findings',
  clean: 'Continuity clean',
  authorized: 'Execution authorized',
  'not-authorized': 'Execution pending',
};

const EVIDENCE_GLYPH: Record<string, string> = {
  empty: '○',
  partial: '◑',
  complete: '✓',
  'all-pinned': '✓',
  unresolved: '✕',
  approved: '✓',
  'missing-approval': '◔',
  blocked: '✕',
  finding: '◔',
  clean: '✓',
  authorized: '✓',
  'not-authorized': '○',
};

const PRESENTATION_GLYPH: Record<EvidenceTone, string> = {
  success: '✓',
  warning: '⚠',
  blocked: '✕',
  info: 'ℹ',
};

function toneFor(state: string): EvidenceBadgeTone {
  switch (state) {
    case 'complete':
    case 'all-pinned':
    case 'approved':
    case 'clean':
    case 'authorized':
      return 'success';
    case 'partial':
    case 'missing-approval':
    case 'finding':
    case 'not-authorized':
      return 'warning';
    case 'unresolved':
    case 'blocked':
      return 'blocked';
    default:
      return 'neutral';
  }
}

function EvidenceBadge({ state }: { state: string }) {
  return (
    <EvidenceStatusBadge tone={toneFor(state)}>
      <span aria-hidden="true">{EVIDENCE_GLYPH[state]}</span>
      {EVIDENCE_LABEL[state]}
    </EvidenceStatusBadge>
  );
}

export function VisualControlSection({
  shotCode,
  state,
  repin,
}: {
  shotCode: string;
  state: VisualControlState;
  repin?: RepinData;
}) {
  const evidence = deriveReadinessEvidence(state);
  const packageEligibility = deriveVisualPackageApprovalEligibility(state);
  const completion = evidence.completion as CompletionState;
  const pins = evidence.pins as PinState | null;
  const approvals = evidence.approvals as ApprovalState | null;
  const continuity = evidence.continuity as ContinuityState | null;
  const execution = evidence.execution as ExecutionState;

  return (
    <section id="visual-control" aria-labelledby="visual-control-heading" className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="visual-control-heading" className="text-lg font-semibold text-ink-hi">
          Visual Control
        </h2>
        <EvidenceStatusBadge tone={evidence.presentation.tone} title={evidence.presentation.detail}>
          <span aria-hidden="true">{PRESENTATION_GLYPH[evidence.presentation.tone]}</span>
          <span>{evidence.presentation.label}</span>
        </EvidenceStatusBadge>
      </header>

      <div className="rounded-lg border border-line bg-surface-1 p-4">
        <div role="status" aria-live="polite" className="flex flex-wrap gap-1.5">
          <EvidenceBadge state={completion} />
          {pins && <EvidenceBadge state={pins} />}
          {approvals && <EvidenceBadge state={approvals} />}
          {continuity && <EvidenceBadge state={continuity} />}
          <EvidenceBadge state={execution} />
        </div>
        <p className="mt-2 text-sm text-ink-mid">{evidence.presentation.detail}</p>
        {evidence.blockers.length > 1 && (
          <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-mid">
            {evidence.blockers.map((blocker) => (
              <li key={blocker.code}>
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-lo">{blocker.code}: </span>
                {blocker.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <VisualPackageApprovalControls
        slug={state.projectSlug}
        shotCode={shotCode}
        packageFingerprint={state.packageFingerprint}
        eligibility={packageEligibility}
      />

      <details className="group rounded-lg border border-line bg-surface-1 [&::-webkit-details-marker]:hidden" open>
        <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink-hi">
          <span>Shot package evidence</span>
          <span className="text-xs font-normal text-ink-lo group-open:hidden">Show details</span>
          <span className="hidden text-xs font-normal text-ink-lo group-open:inline">Hide details</span>
        </summary>
        <div className="grid gap-3 border-t border-line p-4 md:grid-cols-2">
          <VisualSpecSummary spec={state.visualSpec} />
          <PinnedReferencesSummary
            pins={state.pinnedReferences}
            approvedReferences={state.approvedReferences}
            repin={repin}
          />
          <PromptReviewSummary prompt={state.prompt} />
          <AssetReviewSummary assets={state.assets} />
          <VisualContinuityPanel state={state} />
          {repin && <ProjectStyleReview projectStyle={repin.projectStyle} />}
          <PackageSummary shotCode={shotCode} />
        </div>
      </details>
    </section>
  );
}
