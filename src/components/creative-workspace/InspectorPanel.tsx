import type { ReactNode } from 'react';
import { Badge, StatusBadge } from '@/components/ui';
import { SectionReveal } from '@/components/motion/SectionReveal';
import { formatUpdatedAt } from './EntityCard';

/**
 * The shared, read-only Inspector contract. `CreativeEntitySummary`
 * (Character/Location, Slice 2) already satisfies every optional field
 * here, so its call sites pass unchanged. Scene/Shot summaries (Slice 3)
 * populate only the fields their domain record actually supports and omit
 * the rest — an omitted field renders nothing, never a guessed value.
 */
export interface InspectorEntity {
  id: string;
  code: string;
  name: string;
  status: string;
  version?: number;
  lockEnabled?: boolean | null;
  subtitle?: string;
  sceneUsage?: number;
  shotUsage?: number;
  metadata: { label: string; value: string }[];
  warnings: string[];
  updatedAt?: string | null;
}

/**
 * Read-only Inspector, reused across every creative-workspace browser
 * (docs/design/COMPONENT-GUIDELINES.md — InspectorPanel). No editing,
 * restore or destructive control: only metadata, status, lock state,
 * usage and warnings already present on the summary.
 */
export function InspectorPanel({
  entity,
  onClose,
  actions,
}: {
  entity: InspectorEntity;
  onClose: () => void;
  /** Optional real navigation links into existing routes (e.g. "View shots"). Never a mutation control. */
  actions?: ReactNode;
}) {
  const hasLock = entity.lockEnabled === true || entity.lockEnabled === false;

  return (
    <SectionReveal key={entity.id}>
      <section
        aria-label={`Inspector: ${entity.name}`}
        className="flex h-full flex-col gap-4 rounded-lg border border-line bg-surface-1 p-4"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-ink-lo">{entity.code}</p>
            <h3 className="truncate text-base font-semibold text-ink-hi">{entity.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-md border border-line px-2 py-1 text-xs text-ink-mid hover:bg-surface-2 hover:text-ink-hi focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1"
          >
            Close
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={entity.status} />
          {entity.subtitle && <Badge>{entity.subtitle}</Badge>}
          {entity.version !== undefined && <Badge>v{entity.version}</Badge>}
          {hasLock && (
            <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-mid">
              <span aria-hidden="true">{entity.lockEnabled ? '🔒' : '🔓'}</span>
              {entity.lockEnabled ? 'Locked' : 'Unlocked'}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          {entity.sceneUsage !== undefined && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-lo">Scene usage</dt>
              <dd className="mt-0.5 tabular-nums text-ink-hi">{entity.sceneUsage}</dd>
            </div>
          )}
          {entity.shotUsage !== undefined && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-lo">Shot usage</dt>
              <dd className="mt-0.5 tabular-nums text-ink-hi">{entity.shotUsage}</dd>
            </div>
          )}
          {entity.metadata.map((field) => (
            <div key={field.label}>
              <dt className="text-xs uppercase tracking-wide text-ink-lo">{field.label}</dt>
              <dd className="mt-0.5 text-ink-hi">{field.value}</dd>
            </div>
          ))}
        </dl>

        {entity.warnings.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-lo">Warnings</p>
            <ul className="mt-1 space-y-1">
              {entity.warnings.map((warning) => (
                <li key={warning} className="border-l-2 border-warning pl-2 text-xs text-ink-mid">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {actions && <div className="flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div>}

        {entity.updatedAt != null && (
          <p className="mt-auto text-[11px] text-ink-lo">Last updated {formatUpdatedAt(entity.updatedAt)}</p>
        )}
      </section>
    </SectionReveal>
  );
}
