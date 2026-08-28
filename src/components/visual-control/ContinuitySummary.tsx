/**
 * VC2 — Visual continuity summary (TASK-UI-VISUAL-CONTROL-001).
 * Shows the shot's continuity neighbours, findings and blocking findings from
 * the VC1 read model.
 */
import type { VisualContinuityState } from '@/domain/visualControl/types';
import { Badge, Card, Notice } from '@/components/ui';
import { EvidenceStatusBadge } from './EvidenceStatusBadge';

export function ContinuitySummary({ continuity }: { continuity: VisualContinuityState }) {
  const { previousShotCode, nextShotCode, findings, blockers } = continuity;
  return (
    <Card title="Visual continuity">
      <p className="text-sm text-ink-mid">
        Prev <Badge>{previousShotCode ?? '—'}</Badge>
        <span className="mx-1">/</span>
        Next <Badge>{nextShotCode ?? '—'}</Badge>
      </p>
      {blockers.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          <EvidenceStatusBadge tone="blocked">
            ✕ {blockers.length} blocker{blockers.length === 1 ? '' : 's'}
          </EvidenceStatusBadge>
          <ul className="space-y-1 text-xs text-ink-mid">
            {blockers.map((blocker) => (
              <li key={blocker.rule}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      ) : findings.length > 0 ? (
        <div className="mt-2">
          <EvidenceStatusBadge tone="warning">
            ◔ {findings.length} finding{findings.length === 1 ? '' : 's'}
          </EvidenceStatusBadge>
        </div>
      ) : (
        <div className="mt-2">
          <Notice tone="success">No continuity findings for this cut.</Notice>
        </div>
      )}
    </Card>
  );
}
