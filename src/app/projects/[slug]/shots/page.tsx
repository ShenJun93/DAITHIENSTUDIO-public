/** Shot List — the production spine, grouped by scene so shots can be reordered within one. */
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { buildShotsAction, reorderShotsAction } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { ShotOrderList } from '@/components/ShotOrderList';
import { Card, EmptyState } from '@/components/ui';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';

export const dynamic = 'force-dynamic';

export default async function ShotsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const activeEpisode = await getActiveEpisode(studio, project.id);
  const [sceneList, characterList] = await Promise.all([
    activeEpisode?.id
      ? studio.scenes.listByEpisode(project.id, activeEpisode.id)
      : studio.scenes.listByProject(project.id),
    studio.bibles.listCharacters(project.id),
  ]);
  const shotsByScene = await Promise.all(sceneList.map((scene) => studio.shots.listByScene(scene.id)));
  const totalShots = shotsByScene.reduce((sum, list) => sum + list.length, 0);

  return (
    <Card
      title={`Shot list (${totalShots})`}
      action={<ActionButton action={buildShotsAction.bind(null, slug)} label="Build missing coverage" variant="ghost" />}
    >
      {totalShots === 0 ? (
        <EmptyState title="No shots yet" hint="Parse a script into scenes, then build coverage." />
      ) : (
        <div className="space-y-4">
          {sceneList.map((scene, index) => {
            const shots = shotsByScene[index] ?? [];
            if (shots.length === 0) return null;
            return (
              <div key={scene.id} className="rounded-lg border border-line">
                <div className="border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-mid">
                  {scene.code} · {scene.title}
                </div>
                <ShotOrderList
                  slug={slug}
                  sceneId={scene.id}
                  shots={shots}
                  characters={characterList}
                  reorderAction={reorderShotsAction.bind(null, slug)}
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
