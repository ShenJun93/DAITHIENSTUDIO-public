import { Card, Notice, StatusBadge } from '@/components/ui';
import { PromptApprovalControls } from '@/components/shot-inspector/PromptApprovalControls';
import type { PromptHealth } from '@/components/shot-inspector/promptHealthUtils';
import {
  capabilityLabel,
  formatEstimatedCost,
  providerRiskLabel,
  type PreflightKindReadiness,
  type PreflightReadinessData,
} from '@/components/shot-inspector/preflightReadinessUtils';

function kindTitle(kind: PreflightKindReadiness['kind']): string {
  return kind === 'image' ? 'Image generation' : 'Video generation';
}

function providerRow(row: PreflightKindReadiness, promptHealth: PromptHealth['image']) {
  const capability = capabilityLabel(row);
  const risk = providerRiskLabel(row);
  const capabilityStatus = capability === 'Compatible' ? 'approved' : 'warning';

  return (
    <section className="rounded-lg border border-line bg-surface-2 p-3" aria-label={`${kindTitle(row.kind)} preflight`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-hi">{kindTitle(row.kind)}</h3>
        <span className="rounded border border-line px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink-mid">
          {risk}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-ink-lo">Configured Provider</dt>
          <dd className="font-mono text-ink-hi">{row.providerLabel ? `${row.providerLabel} (${row.provider})` : row.provider}</dd>
        </div>
        <div>
          <dt className="text-ink-lo">Configured model</dt>
          <dd className="font-mono text-ink-hi">{row.model ?? 'Unavailable from registered descriptor'}</dd>
        </div>
        <div>
          <dt className="text-ink-lo">Declared capability</dt>
          <dd className="mt-1 flex items-center gap-2 text-ink-hi">
            <StatusBadge status={capabilityStatus} />
            {capability}
          </dd>
        </div>
        <div>
          <dt className="text-ink-lo">Estimated request cost</dt>
          <dd className="font-mono text-ink-hi">{formatEstimatedCost(row.estimatedCostUsd)} estimate</dd>
        </div>
      </dl>

      <div className="mt-3 rounded border border-line bg-surface-1 p-2 text-xs">
        <p className="font-medium text-ink-hi">Existing prompt readiness: {promptHealth.status}</p>
        <p className="mt-1 text-ink-mid">{promptHealth.reason}</p>
      </div>
    </section>
  );
}

export function PreflightReadiness({ data, promptHealth }: { data: PreflightReadinessData; promptHealth: PromptHealth }) {
  return (
    <Card title="Preflight readiness">
      <div className="space-y-3" aria-label="Provider-safe preflight readiness">
        <Notice tone="info">
          Read-only readiness only. This surface does not authorize generation, call an execution adapter, reserve project budget, or change credentials. Prompt review decisions below persist audit evidence only and do not change that execution boundary.
        </Notice>

        <div className="grid gap-3 lg:grid-cols-2">
          {providerRow(data.image, promptHealth.image)}
          {providerRow(data.video, promptHealth.video)}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-lo">Exact prompt-version review</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            <PromptApprovalControls kind="image" />
            <PromptApprovalControls kind="video" />
          </div>
        </div>

        <p className="text-xs leading-5 text-ink-lo">
          Project cost ceilings remain authoritative at enqueue time, where reservation is enforced atomically. No exact remaining-budget value is approximated here.
        </p>
      </div>
    </Card>
  );
}
