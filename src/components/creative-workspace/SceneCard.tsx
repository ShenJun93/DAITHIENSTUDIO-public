import type { CreativeSceneSummary } from '@/application/services/creativeWorkspaceService';
import { StatusBadge } from '@/components/ui';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

/** One selectable scene card for the Scene Board. Scenes stay in their persisted sequence. */
export function SceneCard({
  scene,
  selected,
  onSelect,
}: {
  scene: CreativeSceneSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const needsAttention = scene.warnings.length > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full flex-col gap-3 rounded-lg border bg-surface-1 p-3 text-left transition-colors duration-fast ease-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface-0 ${
        selected ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand/60 hover:bg-surface-2'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-lo">
            {scene.code} · Scene {scene.number}
          </p>
          <p className="truncate text-sm font-semibold text-ink-hi">{scene.title || '(untitled scene)'}</p>
        </div>
        <StatusBadge status={scene.status} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full border px-2 py-0.5 font-medium ${
            needsAttention
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {needsAttention ? `${scene.warnings.length} attention item${scene.warnings.length === 1 ? '' : 's'}` : 'Clear for next step'}
        </span>
        <span className="text-ink-lo">{scene.shotCount > 0 ? `${scene.shotCount} shots linked` : 'No shots yet'}</span>
      </div>

      {scene.synopsis && <p className="line-clamp-2 text-xs leading-relaxed text-ink-mid">{scene.synopsis}</p>}

      <div className="border-t border-line pt-2">
        <p className="truncate text-xs text-ink-mid">
          {scene.locationName ?? 'No location assigned'} · {scene.timeOfDay} · {formatDuration(scene.durationSeconds)}
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-ink-lo">Shots</dt>
            <dd className="tabular-nums font-medium text-ink-hi">{scene.shotCount}</dd>
          </div>
          <div>
            <dt className="text-ink-lo">Characters</dt>
            <dd className="tabular-nums font-medium text-ink-hi">{scene.characterCount}</dd>
          </div>
          <div>
            <dt className="text-ink-lo">Warnings</dt>
            <dd className="tabular-nums font-medium text-ink-hi">{scene.warnings.length}</dd>
          </div>
        </dl>
      </div>
    </button>
  );
}
