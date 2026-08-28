import Link from 'next/link';
import {
  projectRoute,
  type JourneyIssue,
  type JourneyPhase,
  type JourneyPhaseState,
  type JourneyPhaseStateValue,
  type ProductionJourneyState,
} from '@/application/services/productionJourneyService';

const PHASE_LABEL: Record<JourneyPhase, string> = {
  setup: 'Setup',
  develop: 'Develop',
  plan: 'Plan',
  produce: 'Produce',
  review: 'Review',
  finish: 'Finish',
};

const STATE_LABEL: Record<JourneyPhaseStateValue, { glyph: string; label: string }> = {
  NOT_STARTED: { glyph: '○', label: 'Not started' },
  IN_PROGRESS: { glyph: '◐', label: 'In progress' },
  READY: { glyph: '◑', label: 'Ready' },
  BLOCKED: { glyph: '⚠', label: 'Blocked' },
  COMPLETE: { glyph: '✓', label: 'Complete' },
};

/** Verbatim from PRODUCTION-JOURNEY-PHASES.md's Purpose/User question fields. */
const PHASE_PURPOSE: Record<JourneyPhase, { purpose: string; question: string }> = {
  setup: {
    purpose: "confirm the project's identity and output intent before any creative content work begins.",
    question: 'What am I making, and for where?',
  },
  develop: {
    purpose:
      'build the narrative and canon foundation — script, episodes, and the Character/Location/Prop/Style bibles a production draws identity and continuity from.',
    question: 'What is the story, and who/where is in it?',
  },
  plan: {
    purpose:
      'turn the script and bibles into a shootable shot list — scenes broken into shots, storyboarded and continuity-checked before generation spend.',
    question: 'What exactly needs to be generated, shot by shot?',
  },
  produce: {
    purpose: 'compile prompts and generate the actual image/video/voice assets for each shot.',
    question: "Is the media for this shot actually made yet, and what's still queued?",
  },
  review: {
    purpose:
      'confirm continuity, quality and approval state before assembling a deliverable — the checkpoint between "generated" and "ready to finish."',
    question: 'Is anything wrong, and has a human signed off?',
  },
  finish: {
    purpose: 'assemble the timeline, export the deliverable and, where applicable, publish it.',
    question: 'Is this ready to hand off, and did the handoff succeed?',
  },
};

type CriterionEvidence = 'phase-state' | { issueIds?: readonly string[]; issuePrefixes?: readonly string[] } | null;
type CapabilityKeyLiteral =
  | 'generation.image.submit'
  | 'generation.video.submit'
  | 'continuity.check'
  | 'asset.approve'
  | 'composer.compose'
  | 'export.create';

interface PhaseCriterion {
  id: string;
  label: string;
  evidence: CriterionEvidence;
  capabilityKeys?: readonly CapabilityKeyLiteral[];
}

const PHASE_CRITERIA: Record<JourneyPhase, PhaseCriterion[]> = {
  setup: [
    { id: 'setup.episode-exists', label: 'At least one episode exists', evidence: 'phase-state' },
    {
      id: 'setup.output-profile',
      label: 'Output profile fields are set (platform, aspect ratio, resolution, language)',
      evidence: null,
    },
  ],
  develop: [
    { id: 'develop.script-written', label: 'A script has been written', evidence: { issueIds: ['warning.script-empty'] } },
    {
      id: 'develop.script-parsed',
      label: 'The script has been parsed into scenes',
      evidence: { issueIds: ['warning.script-unparsed'] },
    },
    {
      id: 'develop.bibles-referenced',
      label: 'Bible entries exist for every character/location the script references',
      evidence: null,
    },
  ],
  plan: [
    {
      id: 'plan.shots-built',
      label: 'Every scene has at least one shot',
      evidence: { issueIds: ['warning.shots', 'warning.scenes'] },
    },
    {
      id: 'plan.anchors-resolved',
      label: 'Every pinned Bible snapshot has an approved consistency-gate anchor',
      evidence: { issueIds: ['warning.anchors'] },
    },
  ],
  produce: [
    {
      id: 'produce.media-generated',
      label: 'Generated media exists for every compiled prompt',
      evidence: { issueIds: ['warning.shot-media'] },
    },
    {
      id: 'produce.no-failures',
      label: 'No generation job has failed without a resolution',
      evidence: { issueIds: ['warning.generation-failures'] },
    },
    {
      id: 'produce.provider-available',
      label: 'A provider is configured for the required generation capability',
      evidence: {
        issueIds: ['produce.provider-unavailable'],
        issuePrefixes: ['capability.generation.'],
      },
    },
  ],
  review: [
    {
      id: 'review.assets-approved',
      label: 'No generated asset is still awaiting approval',
      evidence: { issueIds: ['warning.asset-review'] },
      capabilityKeys: ['asset.approve'],
    },
    {
      id: 'review.continuity-clear',
      label: 'No continuity finding is unresolved',
      evidence: { issuePrefixes: ['continuity.'] },
      capabilityKeys: ['continuity.check'],
    },
  ],
  finish: [
    { id: 'finish.exported', label: 'A successful export has been produced', evidence: 'phase-state' },
    {
      id: 'finish.publish-status',
      label: 'Publish status for the latest export (see Timeline & Export)',
      evidence: null,
    },
  ],
};

const PHASE_SHORTCUTS: Record<JourneyPhase, { label: string; suffix: Parameters<typeof projectRoute>[1] }[]> = {
  setup: [{ label: 'Project Overview', suffix: '' }],
  develop: [
    { label: 'Story', suffix: '/story' },
    { label: 'Script', suffix: '/script' },
    { label: 'Bibles', suffix: '/bibles' },
  ],
  plan: [
    { label: 'Scenes', suffix: '/scenes' },
    { label: 'Shots', suffix: '/shots' },
    { label: 'Production Strategy', suffix: '/production' },
  ],
  produce: [
    { label: 'Assets', suffix: '/assets' },
    { label: 'Render Queue', suffix: '/queue' },
  ],
  review: [
    { label: 'Continuity', suffix: '/continuity' },
    { label: 'Assets', suffix: '/assets' },
  ],
  finish: [{ label: 'Timeline & Export', suffix: '/export' }],
};

type CriterionStatusValue = 'complete' | 'incomplete' | 'blocked' | 'unavailable' | 'optional' | 'not-applicable';
type CriterionApplicability = 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE' | null;

const CRITERION_STYLE: Record<CriterionStatusValue, { glyph: string; label: string }> = {
  complete: { glyph: '✓', label: 'Complete' },
  incomplete: { glyph: '○', label: 'Incomplete' },
  blocked: { glyph: '⚠', label: 'Blocked' },
  unavailable: { glyph: '—', label: 'Unavailable' },
  optional: { glyph: '◇', label: 'Optional' },
  'not-applicable': { glyph: '—', label: 'Not applicable' },
};

function matchesEvidence(issue: JourneyIssue, evidence: { issueIds?: readonly string[]; issuePrefixes?: readonly string[] }): boolean {
  if (evidence.issueIds?.includes(issue.id)) return true;
  if (evidence.issuePrefixes?.some((prefix) => issue.id.startsWith(prefix))) return true;
  return false;
}

function criterionApplicability(
  criterion: PhaseCriterion,
  journey?: ProductionJourneyState,
): CriterionApplicability {
  if (!criterion.capabilityKeys || !journey?.capabilityStages?.length) return null;
  const matched = journey.capabilityStages.filter((stage) =>
    criterion.capabilityKeys!.includes(stage.key as CapabilityKeyLiteral),
  );
  if (matched.length === 0) return null;
  if (matched.some((stage) => stage.applicability === 'REQUIRED')) return 'REQUIRED';
  if (matched.some((stage) => stage.applicability === 'OPTIONAL')) return 'OPTIONAL';
  return 'NOT_APPLICABLE';
}

function criterionStatus(
  criterion: PhaseCriterion,
  phaseState: JourneyPhaseState,
  applicability: CriterionApplicability = null,
): { status: CriterionStatusValue; issue: JourneyIssue | null } {
  if (applicability === 'OPTIONAL') return { status: 'optional', issue: null };
  if (applicability === 'NOT_APPLICABLE') return { status: 'not-applicable', issue: null };
  if (criterion.evidence === null) return { status: 'unavailable', issue: null };
  if (criterion.evidence === 'phase-state') {
    if (phaseState.state === 'COMPLETE') return { status: 'complete', issue: null };
    if (phaseState.state === 'BLOCKED') return { status: 'blocked', issue: phaseState.blockers[0] ?? null };
    return { status: 'incomplete', issue: null };
  }
  if (phaseState.state === 'NOT_STARTED') return { status: 'incomplete', issue: null };
  if (phaseState.state === 'COMPLETE') return { status: 'complete', issue: null };
  const evidence = criterion.evidence;
  const blocker = phaseState.blockers.find((issue) => matchesEvidence(issue, evidence));
  if (blocker) return { status: 'blocked', issue: blocker };
  const warning = phaseState.warnings.find((issue) => matchesEvidence(issue, evidence));
  if (warning) return { status: 'incomplete', issue: warning };
  return { status: 'complete', issue: null };
}

function applicabilitySuffix(applicability: CriterionApplicability): string {
  if (applicability === 'OPTIONAL') return ' — Optional';
  if (applicability === 'NOT_APPLICABLE') return ' — Not applicable';
  return '';
}

export function PhaseCriteriaList({
  phase,
  phaseState,
  journey,
}: {
  phase: JourneyPhase;
  phaseState: JourneyPhaseState;
  journey?: ProductionJourneyState;
}) {
  const criteria = PHASE_CRITERIA[phase];
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-lo">Completion criteria</p>
      <ul className="mt-1 space-y-1.5">
        {criteria.map((criterion) => {
          const applicability = criterionApplicability(criterion, journey);
          const { status, issue } = criterionStatus(criterion, phaseState, applicability);
          const style = CRITERION_STYLE[status];
          const showResolveLink = issue?.targetRoute && (status === 'incomplete' || status === 'blocked');
          return (
            <li key={criterion.id} className="flex items-start gap-2 text-sm">
              <span aria-hidden="true">{style.glyph}</span>
              <span className="flex-1 text-ink-hi">
                {criterion.label}{applicabilitySuffix(applicability)}
                <span className="ml-1.5 text-xs text-ink-mid">({style.label})</span>
                {showResolveLink && (
                  <>
                    {' '}
                    <Link href={issue!.targetRoute} className="text-xs font-medium text-brand hover:underline">
                      Resolve →
                    </Link>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PhaseModuleShortcuts({ phase, slug }: { phase: JourneyPhase; slug: string }) {
  const shortcuts = PHASE_SHORTCUTS[phase];
  return (
    <nav aria-label={`${PHASE_LABEL[phase]} module shortcuts`}>
      <p className="text-xs uppercase tracking-wide text-ink-lo">Open a module</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {shortcuts.map((shortcut) => (
          <li key={shortcut.suffix}>
            <Link
              href={projectRoute(slug, shortcut.suffix)}
              className="inline-flex items-center rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-hi hover:border-brand hover:bg-surface-3"
            >
              {shortcut.label} →
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PrimaryActionConnection({ journey, phase }: { journey: ProductionJourneyState; phase: JourneyPhase }) {
  const action = journey.primaryAction;
  if (!action) {
    return (
      <p className="text-sm text-ink-mid">
        No further action is currently recommended — every phase is complete or has nothing actionable yet.
      </p>
    );
  }
  if (action.phase === phase) {
    return (
      <p className="text-sm text-ink-mid">
        {action.targetRoute ? (
          <>
            Next step for this phase:{' '}
            <Link href={action.targetRoute} className="font-medium text-brand hover:underline">
              {action.label} →
            </Link>
          </>
        ) : (
          <>Next step for this phase: {action.label} (no direct link available).</>
        )}
      </p>
    );
  }
  return (
    <p className="text-sm text-ink-mid">
      The current recommended action is in the {PHASE_LABEL[action.phase]} phase — see Next action above.
    </p>
  );
}

function PhaseIssueCount({ phaseState }: { phaseState: JourneyPhaseState }) {
  const blockerCount = phaseState.blockers.length;
  const warningCount = phaseState.warnings.length;
  if (blockerCount === 0 && warningCount === 0) return null;
  const parts: string[] = [];
  if (blockerCount > 0) parts.push(`${blockerCount} blocker${blockerCount === 1 ? '' : 's'}`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount === 1 ? '' : 's'}`);
  return (
    <p className="text-xs text-ink-mid">
      {parts.join(' and ')} affect{blockerCount + warningCount === 1 ? 's' : ''} this phase — see Blockers &amp;
      warnings above for the full list.
    </p>
  );
}

export function PhaseContextPanel({ journey, phaseState }: { journey: ProductionJourneyState; phaseState: JourneyPhaseState }) {
  const phase = phaseState.phase;
  const copy = PHASE_PURPOSE[phase];
  const stateStyle = STATE_LABEL[phaseState.state];
  return (
    <section aria-label={`Guided view: ${PHASE_LABEL[phase]}`} className="space-y-4 rounded-lg border border-line bg-surface-1 p-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-lo">Current phase</p>
        <h3 className="text-base font-semibold text-ink-hi">{PHASE_LABEL[phase]}</h3>
        <p className="mt-1 text-sm text-ink-mid">{copy.question}</p>
        <p className="mt-1 text-sm text-ink-mid">
          {PHASE_LABEL[phase]} is where you {copy.purpose}
        </p>
        <p className="mt-2 flex items-center gap-1 text-sm text-ink-hi">
          <span aria-hidden="true">{stateStyle.glyph}</span>
          {stateStyle.label}
        </p>
      </div>
      <PhaseCriteriaList phase={phase} phaseState={phaseState} journey={journey} />
      <PhaseIssueCount phaseState={phaseState} />
      <PhaseModuleShortcuts phase={phase} slug={journey.projectSlug} />
      <PrimaryActionConnection journey={journey} phase={phase} />
    </section>
  );
}

export function GuidedPhaseView({ journey }: { journey: ProductionJourneyState }) {
  const phaseState = journey.phases.find((candidate) => candidate.phase === journey.currentPhase)!;
  return <PhaseContextPanel journey={journey} phaseState={phaseState} />;
}
