/** Sound Studio (TASK-017C) — arrange, trim, and mix audio tracks over the episode timeline. */
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createSoundStudioService } from '@/application/services/soundStudioService';
import { saveAudioMixAction } from '@/app/actions';
import { SoundStudio } from '@/components/SoundStudio';
import { EmptyState } from '@/components/ui';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';

export const dynamic = 'force-dynamic';

export default async function SoundStudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const activeEpisode = await getActiveEpisode(studio, project.id);

  if (!activeEpisode) {
    return <EmptyState title="No active episode" hint="Create an episode first to mix audio." />;
  }

  const soundStudioService = createSoundStudioService(studio);
  const mix = await soundStudioService.getMixForEpisode(activeEpisode.id);

  const allAssets = await studio.assets.list(project.id, { limit: 1000 });
  const audioAssets = allAssets.filter(
    (asset) => ['voice', 'sound', 'music'].includes(asset.kind) && asset.approvalState === 'approved',
  );

  return (
    <SoundStudio
      episodeId={activeEpisode.id}
      initialMix={mix}
      audioAssets={audioAssets}
      saveMixAction={saveAudioMixAction.bind(null, slug, activeEpisode.id)}
    />
  );
}
