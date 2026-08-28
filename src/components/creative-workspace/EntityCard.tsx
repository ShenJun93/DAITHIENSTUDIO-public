import type { CreativeEntitySummary } from '@/application/services/creativeWorkspaceService';
import { Badge, StatusBadge } from '@/components/ui';

/** Shared by InspectorPanel so a malformed `updatedAt` never throws — it renders "Unknown" instead. */
export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toISOString().slice(0, 10);
}

/**
 * One selectable entity card for the Character/Location Browser grid. A real
 * `<button>` so it is keyboard-reachable without a hover-only affordance
 * (DESIGN.md — Interaction). No thumbnail image exists in the domain model
 * for either kind, so the monogram below stands in for one as plain text,
 * never a fabricated generated image.
 */
export function EntityCard({
  entity,
  selected,
  onSelect,
}: {
  entity: CreativeEntitySummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full flex-col gap-2 rounded-lg border bg-surface-1 p-3 text-left transition-colors duration-fast ease-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface-0 ${
        selected ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand/60 hover:bg-surface-2'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 font-mono text-sm font-semibold text-ink-mid"
        >
          {entity.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-hi">{entity.name}</p>
          <p className="truncate font-mono text-xs text-ink-lo">{entity.code}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={entity.status} />
        {entity.subtitle && <Badge>{entity.subtitle}</Badge>}
        {entity.lockEnabled !== null && (
          <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-mid">
            <span aria-hidden="true">{entity.lockEnabled ? '🔒' : '🔓'}</span>
            {entity.lockEnabled ? 'Locked' : 'Unlocked'}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 border-t border-line pt-2 text-xs">
        <div>
          <dt className="text-ink-lo">Version</dt>
          <dd className="tabular-nums text-ink-mid">v{entity.version}</dd>
        </div>
        <div>
          <dt className="text-ink-lo">Scenes</dt>
          <dd className="tabular-nums text-ink-mid">{entity.sceneUsage}</dd>
        </div>
        <div>
          <dt className="text-ink-lo">Shots</dt>
          <dd className="tabular-nums text-ink-mid">{entity.shotUsage}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-ink-lo">Updated {formatUpdatedAt(entity.updatedAt)}</p>
    </button>
  );
}
