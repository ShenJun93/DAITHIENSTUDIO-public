import type { CreativeShotSummary } from '@/application/services/creativeWorkspaceService';
import { StatusBadge } from '@/components/ui';

/** One selectable shot card for the Shot Storyboard. Mirrors `EntityCard.tsx`'s interaction pattern. */
export function ShotCard({
  shot,
  selected,
  onSelect,
}: {
  shot: CreativeShotSummary;
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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-lo">{shot.code}</p>
          <p className="truncate text-sm font-medium text-ink-hi">{shot.title || `Shot ${shot.shotNumber}`}</p>
        </div>
        <StatusBadge status={shot.status} />
      </div>

      {shot.description && <p className="line-clamp-2 text-xs text-ink-mid">{shot.description}</p>}

      <p className="text-xs text-ink-lo">
        {shot.shotSize} · {shot.cameraAngle} · {shot.durationSeconds}s
      </p>

      <dl className="grid grid-cols-3 gap-2 border-t border-line pt-2 text-xs">
        <div>
          <dt className="text-ink-lo">Prompts</dt>
          <dd className="tabular-nums text-ink-mid">{shot.promptCount}</dd>
        </div>
        <div>
          <dt className="text-ink-lo">Assets</dt>
          <dd className="tabular-nums text-ink-mid">
            {shot.assetCoverage.approved}/{shot.assetCoverage.total}
          </dd>
        </div>
        <div>
          <dt className="text-ink-lo">Render</dt>
          <dd className="text-ink-mid">
            {shot.generationStatus ? <StatusBadge status={shot.generationStatus} /> : 'Not started'}
          </dd>
        </div>
      </dl>
    </button>
  );
}
