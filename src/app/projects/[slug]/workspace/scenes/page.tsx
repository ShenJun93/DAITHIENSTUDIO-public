import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createCreativeWorkspaceService } from '@/application/services/creativeWorkspaceService';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';
import { SceneBoardView } from '@/components/creative-workspace/SceneBoardView';
import { Card, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SceneBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  if (!project) notFound();
  const activeEpisode = await getActiveEpisode(studio, project.id);
  const board = await createCreativeWorkspaceService(studio).sceneBoard(slug, activeEpisode?.id);

  const totalShots = board.scenes.reduce((total, scene) => total + scene.shotCount, 0);
  const attentionScenes = board.scenes.filter((scene) => scene.warnings.length > 0).length;
  const clearScenes = board.scenes.length - attentionScenes;
  const scenesWithoutShots = board.scenes.filter((scene) => scene.shotCount === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-lo">Scene workflow</p>
          <h2 className="mt-1 text-xl font-semibold text-ink-hi">Scene Board</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-mid">
            Review scene order, readiness, and shot coverage before moving into shot-level work.
          </p>
        </div>
        <span className="flex items-center gap-2 text-xs text-ink-lo">
          {board.scriptStatus ? (
            <>
              Script v{board.scriptVersion} <StatusBadge status={board.scriptStatus} />
            </>
          ) : (
            'No script'
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Scene Board summary">
        <div className="rounded-lg border border-line bg-surface-1 p-3">
          <p className="text-xs uppercase tracking-wide text-ink-lo">Scenes</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink-hi">{board.scenes.length}</p>
          <p className="text-xs text-ink-mid">In persisted sequence</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-1 p-3">
          <p className="text-xs uppercase tracking-wide text-ink-lo">Clear</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink-hi">{clearScenes}</p>
          <p className="text-xs text-ink-mid">No current warnings</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-1 p-3">
          <p className="text-xs uppercase tracking-wide text-ink-lo">Needs attention</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink-hi">{attentionScenes}</p>
          <p className="text-xs text-ink-mid">Existing readiness warnings</p>
        </div>
        <div className="rounded-lg border border-line bg-surface-1 p-3">
          <p className="text-xs uppercase tracking-wide text-ink-lo">Shot coverage</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink-hi">{totalShots}</p>
          <p className="text-xs text-ink-mid">{scenesWithoutShots} scenes without shots</p>
        </div>
      </div>

      <Card title={`Scenes in sequence (${board.scenes.length})`}>
        <SceneBoardView scenes={board.scenes} slug={slug} />
      </Card>
    </div>
  );
}
