import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createCreativeWorkspaceService } from '@/application/services/creativeWorkspaceService';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';
import { ShotStoryboardView } from '@/components/creative-workspace/ShotStoryboardView';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ShotStoryboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ scene?: string }>;
}) {
  const { slug } = await params;
  const { scene: sceneCode } = await searchParams;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  if (!project) notFound();
  const activeEpisode = await getActiveEpisode(studio, project.id);
  const storyboard = await createCreativeWorkspaceService(studio).shotStoryboard(slug, activeEpisode?.id, sceneCode);

  const filtered = Boolean(storyboard.sceneFilter);
  const emptyTitle = !storyboard.sceneFilterValid
    ? 'Scene not found'
    : filtered
      ? 'No shots in this scene'
      : 'No shots yet';
  const emptyHint = !storyboard.sceneFilterValid
    ? `Scene ${storyboard.sceneFilter} does not exist in this project or episode. Clear the filter to see every shot.`
    : filtered
      ? `Scene ${storyboard.sceneFilter} has no shots yet. Build coverage from the Shots page.`
      : 'Parse a script into scenes, then build shot coverage from the Shots page.';

  return (
    <Card
      title={`Shots (${storyboard.shots.length})${filtered ? ` · ${storyboard.sceneFilter}${storyboard.sceneFilterValid ? '' : ' (not found)'}` : ''}`}
      action={
        filtered ? (
          <a href={`/projects/${slug}/workspace/shots`} className="text-xs font-medium text-brand hover:underline">
            Clear scene filter
          </a>
        ) : null
      }
    >
      <ShotStoryboardView shots={storyboard.shots} emptyTitle={emptyTitle} emptyHint={emptyHint} />
    </Card>
  );
}
