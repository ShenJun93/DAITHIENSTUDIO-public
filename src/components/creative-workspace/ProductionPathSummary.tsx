import { Card } from '@/components/ui';
import type { JourneyCapabilityStage } from '@/application/services/productionJourneyAdaptation';
import type { ProductionJourneyState } from '@/application/services/productionJourneyService';

const APPLICABILITY_LABEL = {
  REQUIRED: 'Required',
  OPTIONAL: 'Optional',
  NOT_APPLICABLE: 'Not applicable',
} as const;

const AVAILABILITY_LABEL = {
  AVAILABLE: 'Available',
  BLOCKED: 'Blocked',
  PLANNED: 'Planned',
  UNSUPPORTED: 'Unsupported',
} as const;

const PHASE_GROUPS: ReadonlyArray<{
  phase: JourneyCapabilityStage['phase'];
  label: string;
}> = [
  { phase: 'produce', label: 'Produce' },
  { phase: 'review', label: 'Review' },
  { phase: 'finish', label: 'Finish' },
];

function StageRow({ stage }: { stage: JourneyCapabilityStage }) {
  const availability = AVAILABILITY_LABEL[stage.availability.state];
  return (
    <li className="rounded-md border border-line bg-surface-1 p-3">
      <p className="text-sm font-medium text-ink-hi">{stage.label}</p>
      <p className="mt-1 text-xs text-ink-mid">
        {APPLICABILITY_LABEL[stage.applicability]} · {availability}
      </p>
      {stage.availability.reasonCode && stage.availability.state !== 'AVAILABLE' && (
        <p className="mt-1 text-xs text-ink-lo">{stage.availability.reasonCode}</p>
      )}
    </li>
  );
}

export function ProductionPathSummary({ journey }: { journey: ProductionJourneyState }) {
  if (!journey.productionType) {
    return (
      <Card title="Production path">
        <p className="text-sm text-ink-mid">Select a Production Type to resolve this production path.</p>
      </Card>
    );
  }

  const stages = journey.capabilityStages ?? [];
  return (
    <Card
      title="Production path"
      action={<span className="text-xs text-ink-lo">{journey.productionType}</span>}
    >
      <div className="grid gap-4 lg:grid-cols-3" aria-label="Production capability path">
        {PHASE_GROUPS.map((group) => (
          <section key={group.phase} aria-label={`${group.label} capability stages`}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-lo">{group.label}</h3>
            <ul className="space-y-2">
              {stages
                .filter((stage) => stage.phase === group.phase)
                .map((stage) => <StageRow key={stage.key} stage={stage} />)}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
