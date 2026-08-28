/**
 * Journey Home shell (TASK-UI-PRODUCTION-JOURNEY-001, Slice 2).
 * Pure presentation over ProductionJourneyState; application logic remains in
 * src/application/services/**.
 */
import Link from 'next/link';
import { ProgressTransition } from '@/components/motion/ProgressTransition';
import { Card, EmptyState } from '@/components/ui';
import { GuidedPhaseView } from './GuidedPhaseView';
import { ProductionPathSummary } from './ProductionPathSummary';
import type {
  JourneyAction,
  JourneyIssue,
  JourneyPhase,
  JourneyPhaseState,
  JourneyPhaseStateValue,
  ProductionJourneyState,
} from '@/application/services/productionJourneyService';

const PHASE_LABEL: Record<JourneyPhase, string> = {
  setup: 'Setup',
  develop: 'Develop',
  plan: 'Plan',
  produce: 'Produce',
  review: 'Review',
  finish: 'Finish',
};

const PHASE_ROUTES: Record<JourneyPhase, (slug: string) => string> = {
  setup: (slug) => `/projects/${slug}`,
  develop: (slug) => `/projects/${slug}/script`,
  plan: (slug) => `/projects/${slug}/shots`,
  produce: (slug) => `/projects/${slug}/assets`,
  review: (slug) => `/projects/${slug}/continuity`,
  finish: (slug) => `/projects/${slug}/export`,
};

const STATE_STYLE: Record<JourneyPhaseStateValue, { glyph: string; label: string; tone: string }> = {
  NOT_STARTED: { glyph: '○', label: 'Not started', tone: 'border-line bg-surface-2 text-ink-mid' },
  IN_PROGRESS: { glyph: '◐', label: 'In progress', tone: 'border-brand bg-brand-soft text-ink-hi' },
  READY: { glyph: '◑', label: 'Ready', tone: 'border-info bg-info-soft text-ink-hi' },
  BLOCKED: { glyph: '⚠', label: 'Blocked', tone: 'border-blocked bg-blocked-soft text-ink-hi' },
  COMPLETE: { glyph: '✓', label: 'Complete', tone: 'border-success bg-success-soft text-ink-hi' },
};

function hasDisplayableProgress(phase: JourneyPhaseState): boolean {
  return phase.progress !== null && phase.state !== 'NOT_STARTED';
}

function PhaseCard({ phase, isCurrent, slug }: { phase: JourneyPhaseState; isCurrent: boolean; slug: string }) {
  const style = STATE_STYLE[phase.state];
  const issueCount = phase.blockers.length + phase.warnings.length;
  return (
    <li>
      <Link
        href={PHASE_ROUTES[phase.phase](slug)}
        className={`block min-h-24 rounded-lg border p-3 transition hover:border-brand ${style.tone} ${isCurrent ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface-0' : ''}`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink-hi">{PHASE_LABEL[phase.phase]}</span>
          {isCurrent && (
            <span className="rounded border border-brand bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-hi">
              Current phase
            </span>
          )}
        </span>
        <span className="mt-2 flex items-center gap-1 text-xs">
          <span aria-hidden="true">{style.glyph}</span>
          <span>{style.label}</span>
        </span>
        {hasDisplayableProgress(phase) && (
          <span className="mt-1 block text-xs tabular-nums text-ink-mid">{phase.progress}% complete</span>
        )}
        {issueCount > 0 && (
          <span className="mt-1 block text-xs text-ink-mid">
            {phase.blockers.length > 0 && `${phase.blockers.length} blocker${phase.blockers.length === 1 ? '' : 's'}`}
            {phase.blockers.length > 0 && phase.warnings.length > 0 && ' · '}
            {phase.warnings.length > 0 && `${phase.warnings.length} warning${phase.warnings.length === 1 ? '' : 's'}`}
          </span>
        )}
      </Link>
    </li>
  );
}

export function JourneyPhaseStrip({
  phases,
  currentPhase,
  slug,
}: {
  phases: JourneyPhaseState[];
  currentPhase: JourneyPhase;
  slug: string;
}) {
  return (
    <Card title="Production journey" action={<span className="text-xs text-ink-lo">Six phases, always shown</span>}>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Production journey phases">
        {phases.map((phase) => (
          <PhaseCard key={phase.phase} phase={phase} isCurrent={phase.phase === currentPhase} slug={slug} />
        ))}
      </ol>
    </Card>
  );
}

export function JourneyPrimaryAction({ action }: { action: JourneyAction | null }) {
  if (!action) {
    return (
      <Card title="Next action">
        <EmptyState
          title="You're all caught up"
          hint="No further action is recommended right now — every phase is either complete or has nothing actionable yet."
        />
      </Card>
    );
  }
  const hasRoute = Boolean(action.targetRoute);
  const toneClass = action.blocking ? 'border-blocked bg-blocked-soft' : 'border-brand bg-brand-soft';
  return (
    <section
      aria-labelledby="journey-primary-action-title"
      role={action.blocking ? 'alert' : undefined}
      className={`rounded-lg border p-4 ${toneClass}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-mid">
        {action.blocking ? 'Blocked — action needed' : 'Next action'} · {PHASE_LABEL[action.phase]}
      </p>
      <h3 id="journey-primary-action-title" className="mt-1 text-base font-semibold text-ink-hi">
        {action.label}
      </h3>
      <p className="mt-1 text-sm text-ink-mid">{action.reason}</p>
      <p className="mt-3">
        {hasRoute ? (
          <Link href={action.targetRoute} className="text-sm font-medium text-brand hover:underline">
            {action.label} →
          </Link>
        ) : (
          <span className="text-sm text-ink-lo">No direct link is available for this action.</span>
        )}
      </p>
    </section>
  );
}

function redactOpaqueIds(text: string): string {
  return text.replace(/\b[a-z]+_[a-z0-9]{6,}\b/g, '[reference]');
}

function IssueLink({ issue }: { issue: JourneyIssue }) {
  const message = redactOpaqueIds(issue.message);
  return (
    <li className="border-l-2 border-blocked pl-3">
      {issue.targetRoute ? (
        <Link href={issue.targetRoute} className="text-sm font-medium text-ink-hi hover:text-brand hover:underline">
          {message}
        </Link>
      ) : (
        <span className="text-sm font-medium text-ink-hi">{message}</span>
      )}
      <p className="text-xs text-ink-mid">{redactOpaqueIds(issue.reason)}</p>
    </li>
  );
}

export function JourneyIssueSummary({ blockers, warnings }: { blockers: JourneyIssue[]; warnings: JourneyIssue[] }) {
  return (
    <div className="space-y-3">
      {blockers.length > 0 && (
        <div role="alert" aria-labelledby="journey-blockers-title" className="rounded-lg border border-blocked bg-blocked-soft p-4">
          <h3 id="journey-blockers-title" className="flex items-center gap-1.5 text-sm font-semibold text-ink-hi">
            <span aria-hidden="true">⚠</span>
            {blockers.length === 1 ? '1 blocking issue' : `${blockers.length} blocking issues`}
          </h3>
          <ul className="mt-2 space-y-2">
            {blockers.map((issue) => <IssueLink key={issue.id} issue={issue} />)}
          </ul>
        </div>
      )}
      <div aria-labelledby="journey-warnings-title">
        <h3 id="journey-warnings-title" className="text-sm font-semibold text-ink-hi">Journey warnings</h3>
        {warnings.length === 0 ? (
          <p className="mt-1 text-sm text-ink-mid">No open warnings across the journey.</p>
        ) : (
          <p className="mt-1 text-sm text-ink-mid">
            {warnings.length} warning{warnings.length === 1 ? '' : 's'} open.{' '}
            {warnings[0]!.targetRoute ? (
              <Link href={warnings[0]!.targetRoute} className="font-medium text-brand hover:underline">Review open warnings →</Link>
            ) : (
              <span>See Warnings below for the full list.</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

const NO_PROGRESS_METRIC_PHASES = new Set<JourneyPhase>(['setup', 'develop', 'review', 'finish']);

function progressFallbackLabel(phase: JourneyPhaseState): string {
  return NO_PROGRESS_METRIC_PHASES.has(phase.phase) ? 'Unavailable' : STATE_STYLE[phase.state].label;
}

export function JourneyProgressSummary({ phases }: { phases: JourneyPhaseState[] }) {
  const completeCount = phases.filter((phase) => phase.state === 'COMPLETE').length;
  return (
    <Card title="Phase progress" action={<span className="text-xs text-ink-lo">{completeCount} of {phases.length} phases complete</span>}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {phases.map((phase) => (
          <div key={phase.phase}>
            <p className="text-xs uppercase tracking-wide text-ink-lo">{PHASE_LABEL[phase.phase]}</p>
            {hasDisplayableProgress(phase) ? (
              <div className="mt-1">
                <ProgressTransition percent={phase.progress!} label={`${PHASE_LABEL[phase.phase]} progress`} />
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-mid">{progressFallbackLabel(phase)}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ProductionJourneyHome({ journey }: { journey: ProductionJourneyState }) {
  return (
    <section aria-label="Production journey" className="space-y-4">
      <JourneyPhaseStrip phases={journey.phases} currentPhase={journey.currentPhase} slug={journey.projectSlug} />
      <ProductionPathSummary journey={journey} />
      <JourneyPrimaryAction action={journey.primaryAction} />
      <JourneyIssueSummary blockers={journey.blockers} warnings={journey.warnings} />
      <JourneyProgressSummary phases={journey.phases} />
      <GuidedPhaseView journey={journey} />
    </section>
  );
}
