/**
 * IA3 (TASK-SHOT-INSPECTOR-IA3) — canonical References tab surface.
 *
 * Server component: a deterministic reference-health summary on top, then the
 * accepted VC3 components reused byte-for-byte — `PinnedReferencesSummary`
 * (with repin data, so each shot-field Character/Location/Prop pin carries
 * the existing explicit repin control) and the read-only `ProjectStyleReview`.
 *
 * No mutation happens here or during render: repinning requires an explicit
 * submit inside `ReferenceRepinControl`, which calls the bound
 * `repinReferenceAction` → `scriptService.repinShot` boundary.
 */
import Link from 'next/link';
import type { ApprovedReferenceState, PinnedReferenceState } from '@/domain/visualControl/types';
import { EvidenceStatusBadge } from '@/components/visual-control/EvidenceStatusBadge';
import { PinnedReferencesSummary } from '@/components/visual-control/PinnedReferencesSummary';
import { ProjectStyleReview } from '@/components/visual-control/ProjectStyleReview';
import type { RepinData } from '@/components/visual-control/visualControlRepin';
import {
  deriveReferenceHealth,
  formatHealthReason,
  referenceHealthGlyph,
  referenceHealthLabel,
} from './referencesUtils';

export interface ReferencesContentProps {
  /** null when the Visual Control read model could not be gathered. */
  pins: PinnedReferenceState[] | null;
  approvedReferences?: ApprovedReferenceState[];
  /** null when the read model is unavailable — the tab degrades to read-only. */
  repin: RepinData | null;
  basePath: string;
}

export function ReferencesContent({ pins, approvedReferences = [], repin, basePath }: ReferencesContentProps) {
  const health = deriveReferenceHealth(pins, basePath);
  const reason = formatHealthReason(health, pins);
  const hasStyle = Boolean(repin);

  return (
    <div className="space-y-6">
      <section aria-labelledby="reference-health-heading" aria-live="polite" className="rounded-lg border border-line bg-surface-1 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="reference-health-heading" className="text-sm font-semibold text-ink-hi">Reference health</h2>
          <EvidenceStatusBadge tone={health.tone}>
            {referenceHealthGlyph(health.status)} {referenceHealthLabel(health.status)}
          </EvidenceStatusBadge>
        </div>
        <p className="mt-2 text-sm text-ink-mid">{reason}</p>
        {health.actionLabel && health.actionDestination && (
          <p className="mt-3">
            <Link
              href={health.actionDestination}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-surface-0 transition hover:opacity-90"
            >
              {health.actionLabel}
            </Link>
          </p>
        )}
      </section>

      {pins && (
        <div className={`grid items-start gap-4 ${hasStyle ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
          <div id="references-pins" className="min-w-0 scroll-mt-4">
            <PinnedReferencesSummary pins={pins} approvedReferences={approvedReferences} repin={repin ?? undefined} />
          </div>
          {repin && (
            <div className="min-w-0">
              <ProjectStyleReview projectStyle={repin.projectStyle} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
