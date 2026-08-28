import Link from 'next/link';
import { Card, Notice } from '@/components/ui';
import { EvidenceStatusBadge } from '@/components/visual-control/EvidenceStatusBadge';
import {
  deriveReadinessTone,
  deriveReadinessGlyph,
  type OverviewAction,
  type OverviewReadiness,
} from './overviewUtils';

const READINESS_LABELS: Record<OverviewReadiness, string> = {
  READY: 'Ready',
  NEEDS_ATTENTION: 'Needs attention',
  BLOCKED: 'Blocked',
  IN_PROGRESS: 'In progress',
  COMPLETE: 'Complete',
};

const SPEC_FIELDS: Array<{ key: string; label: string; value: (shot: OverviewShot) => string }> = [
  { key: 'shotSize', label: 'Shot size', value: (s) => s.shotSize },
  { key: 'cameraAngle', label: 'Camera angle', value: (s) => s.cameraAngle },
  { key: 'lens', label: 'Lens', value: (s) => s.lens },
  { key: 'duration', label: 'Duration', value: (s) => `${s.durationSeconds}s` },
  { key: 'aspectRatio', label: 'Aspect ratio', value: (s) => s.aspectRatio },
  { key: 'lighting', label: 'Lighting', value: (s) => s.lighting || '\u2014' },
];

export interface OverviewShot {
  code: string;
  shotSize: string;
  cameraAngle: string;
  lens: string;
  durationSeconds: number;
  aspectRatio: string;
  description: string;
  dialogue: string;
  lighting: string;
  emotion: string;
  importance: 'normal' | 'key';
}

const SECONDARY_LINKS: Array<{ label: string; tab: string }> = [
  { label: 'References', tab: 'references' },
  { label: 'Prompts', tab: 'prompts' },
  { label: 'Visual Control', tab: 'visual-control' },
  { label: 'Generations', tab: 'generations' },
  { label: 'Technical', tab: 'technical' },
];

export function OverviewContent({
  action,
  shot,
  basePath,
}: {
  action: OverviewAction;
  shot: OverviewShot;
  basePath: string;
}) {
  const tone = deriveReadinessTone(action.readiness);
  const glyph = deriveReadinessGlyph(action.readiness);
  const label = READINESS_LABELS[action.readiness];

  return (
    <div className="space-y-4">
      <section aria-live="polite" className="flex flex-col gap-2">
        <EvidenceStatusBadge tone={tone}>
          {glyph} {label}
        </EvidenceStatusBadge>
        <p className="text-sm text-ink-mid">{action.reason}</p>
      </section>

      {action.readiness === 'BLOCKED' && (
        <Notice tone="warning">{action.reason}</Notice>
      )}

      <Card title="Next action">
        <Link
          href={action.destination}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-5 py-2 text-sm font-semibold text-surface-0 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1"
        >
          {action.primaryLabel} &rarr;
        </Link>
      </Card>

      <Card title="Shot brief">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {SPEC_FIELDS.map((field) => (
            <div key={field.key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-lo">{field.label}</dt>
              <dd className="text-ink-hi">{field.value(shot)}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-lo">Importance</dt>
            <dd className="text-ink-hi">{shot.importance}</dd>
          </div>
          {shot.emotion && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-lo">Emotion</dt>
              <dd className="text-ink-hi">{shot.emotion}</dd>
            </div>
          )}
        </dl>

        {shot.description && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-ink-mid">{shot.description}</p>
        )}
        {shot.dialogue && (
          <p className="mt-2 border-l-2 border-brand pl-3 text-sm italic text-ink-hi">
            &ldquo;{shot.dialogue}&rdquo;
          </p>
        )}
      </Card>

      <nav aria-label="Related tabs" className="flex flex-wrap gap-x-4 gap-y-1">
        {SECONDARY_LINKS.map((link) => (
          <Link
            key={link.tab}
            href={`${basePath}?tab=${link.tab}`}
            className="text-xs text-ink-lo transition hover:text-ink-hi"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
