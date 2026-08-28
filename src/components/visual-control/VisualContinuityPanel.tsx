/**
 * VC4 (TASK-UI-VISUAL-CONTROL-001) — visual continuity panel.
 *
 * A read-only, additive card inside the existing Visual Control section
 * (ADR-013 — no new route, no second dashboard). It renders per-shot character
 * continuity state (costume/look) as a previous/current/next comparison and
 * shows continuity findings as a separate, clearly-labeled group so a finding
 * is never presented as confirmed state. All data comes from the accepted VC1
 * read model (`VisualControlState`): the boundary character states
 * (`visualSpec.continuityIn/Out.characters` + environment), the neighbour
 * codes, the findings and the accepted VC1 continuity-content fingerprint
 * (`continuity.fingerprint`). No mutation, no provider, no generation — the
 * component tree contains no button, form, input, select, textarea or handler.
 */
import type { VisualControlState } from '@/domain/visualControl/types';
import type { ContinuityFinding } from '@/domain/schemas';
import { Badge, Card, Notice } from '@/components/ui';
import { EvidenceStatusBadge, type EvidenceBadgeTone } from './EvidenceStatusBadge';
import {
  countFindingsBySeverity,
  deriveContinuityComparison,
  sortFindings,
  type CharacterBoundaryView,
} from './visualContinuity';

const FINDING_TONE: Record<string, EvidenceBadgeTone> = {
  error: 'blocked',
  warning: 'warning',
  info: 'info',
};

const FINDING_GLYPH: Record<string, string> = {
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

function MissingMarker({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded border border-dashed border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-lo">
      {label}
    </span>
  );
}

function environmentText(
  environment: { time: string; weather: string; lightDirection: string },
): string {
  const parts = [environment.time, environment.weather, environment.lightDirection].filter(
    (value) => value && value !== 'unspecified',
  );
  return parts.join(' · ') || 'no environment state recorded';
}

function CharacterStateRow({ view }: { view: CharacterBoundaryView }) {
  const { state } = view;
  return (
    <li className="rounded border border-line p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-ink-hi">{view.label}</span>
        <Badge>{view.id === view.label ? 'unpinned' : 'pinned'}</Badge>
      </div>
      <dl className="mt-1.5 space-y-1 text-xs">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <dt className="uppercase tracking-wide text-ink-lo">Costume</dt>
          <dd>
            {view.missingCostume ? <MissingMarker label="no costume recorded" /> : <span className="text-ink-mid">{state.costume}</span>}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <dt className="uppercase tracking-wide text-ink-lo">Look</dt>
          <dd>
            {view.missingLook ? (
              <MissingMarker label="no look recorded" />
            ) : (
              <span className="text-ink-mid">
                {state.hair || 'hair as designed'}
                {state.injuries.length > 0 ? ` · injuries: ${state.injuries.join(', ')}` : ''}
              </span>
            )}
          </dd>
        </div>
        {state.position && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="uppercase tracking-wide text-ink-lo">Position</dt>
            <dd className="text-ink-mid">{state.position}</dd>
          </div>
        )}
        {state.heldProps.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="uppercase tracking-wide text-ink-lo">Held props</dt>
            <dd className="text-ink-mid">{state.heldProps.join(', ')}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

function BoundaryColumn({
  label,
  shotCode,
  views,
  environment,
  absentShotLabel,
}: {
  label: string;
  shotCode: string | null;
  views: CharacterBoundaryView[];
  environment: { time: string; weather: string; lightDirection: string };
  absentShotLabel: string;
}) {
  return (
    <div className="rounded border border-line bg-surface-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-ink-hi">{label}</span>
        {shotCode ? <Badge>{shotCode}</Badge> : <MissingMarker label={absentShotLabel} />}
      </div>
      <p className="mt-1 text-[11px] text-ink-lo">Environment: {environmentText(environment)}</p>
      {views.length === 0 ? (
        <p className="mt-2 text-xs text-ink-mid">No characters have recorded state at this boundary.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {views.map((view) => (
            <CharacterStateRow key={view.id} view={view} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingList({ finding }: { finding: ContinuityFinding }) {
  return (
    <li>
      <div className="rounded border border-line p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <EvidenceStatusBadge tone={FINDING_TONE[finding.severity] ?? 'neutral'}>
            <span aria-hidden="true">{FINDING_GLYPH[finding.severity] ?? '•'}</span>
            {finding.severity}
          </EvidenceStatusBadge>
        </div>
        <p className="mt-1 text-sm text-ink-mid">{finding.message}</p>
        {finding.field && (
          <p className="mt-0.5 text-[11px] text-ink-lo">
            {finding.field}: {finding.expected || '—'} → {finding.actual || '—'}
            {finding.shotCodes.length > 0 ? ` · shots ${finding.shotCodes.join(', ')}` : ''}
          </p>
        )}
      </div>
    </li>
  );
}

export function VisualContinuityPanel({ state }: { state: VisualControlState }) {
  const comparison = deriveContinuityComparison(state);
  const findings = sortFindings(state.continuity.findings);
  const counts = countFindingsBySeverity(findings);
  const hasBoundaryState = comparison.entering.length > 0 || comparison.leaving.length > 0;
  const presentSeverities = (['error', 'warning', 'info'] as const).filter((severity) => counts[severity] > 0);

  return (
    <Card
      title="Visual continuity"
      action={
        state.continuity.blockers.length > 0 ? (
          <EvidenceStatusBadge tone="blocked">
            ✕ {state.continuity.blockers.length} blocker{state.continuity.blockers.length === 1 ? '' : 's'}
          </EvidenceStatusBadge>
        ) : state.continuity.findings.length > 0 ? (
          <EvidenceStatusBadge tone="warning">
            ◔ {state.continuity.findings.length} finding{state.continuity.findings.length === 1 ? '' : 's'}
          </EvidenceStatusBadge>
        ) : (
          <EvidenceStatusBadge tone="success">
            ✓ Clean
          </EvidenceStatusBadge>
        )
      }
    >
      <div className="space-y-4">
        <section aria-labelledby="continuity-context-heading">
          <h3 id="continuity-context-heading" className="text-xs uppercase tracking-wide text-ink-lo">
            Cut context
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-ink-lo">From</span>
            {comparison.previousShotCode ? (
              <Badge>{comparison.previousShotCode}</Badge>
            ) : (
              <MissingMarker label="no previous shot" />
            )}
            <span className="text-ink-lo">→</span>
            <Badge>{state.shotCode}</Badge>
            <span className="text-ink-lo">→</span>
            <span className="text-ink-lo">To</span>
            {comparison.nextShotCode ? <Badge>{comparison.nextShotCode}</Badge> : <MissingMarker label="no next shot" />}
          </div>
        </section>

        <section aria-labelledby="continuity-state-heading">
          <h3 id="continuity-state-heading" className="text-xs uppercase tracking-wide text-ink-lo">
            Character continuity state
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <BoundaryColumn
              label="Entering (carried from previous)"
              shotCode={comparison.previousShotCode}
              views={comparison.entering}
              environment={state.visualSpec.continuityIn.environment}
              absentShotLabel="no previous shot"
            />
            <BoundaryColumn
              label="Leaving (carried to next)"
              shotCode={comparison.nextShotCode}
              views={comparison.leaving}
              environment={state.visualSpec.continuityOut.environment}
              absentShotLabel="no next shot"
            />
          </div>
          {!hasBoundaryState && (
            <p className="mt-2 text-xs text-ink-mid">
              No characters have recorded boundary state for this shot.
            </p>
          )}
        </section>

        <section aria-labelledby="continuity-findings-heading">
          <h3 id="continuity-findings-heading" className="text-xs uppercase tracking-wide text-ink-lo">
            Continuity findings
          </h3>
          {findings.length === 0 ? (
            <div className="mt-2">
              <Notice tone="success">No continuity findings for this cut.</Notice>
            </div>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {presentSeverities.map((severity) => (
                  <EvidenceStatusBadge key={severity} tone={FINDING_TONE[severity] ?? 'neutral'}>
                    <span aria-hidden="true">{FINDING_GLYPH[severity]}</span>
                    {counts[severity]} {severity}
                    {counts[severity] === 1 ? '' : 's'}
                  </EvidenceStatusBadge>
                ))}
              </div>
              <ul className="mt-2 space-y-1.5">
                {findings.map((finding, index) => (
                  <FindingList key={`${finding.rule}-${index}`} finding={finding} />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </Card>
  );
}
