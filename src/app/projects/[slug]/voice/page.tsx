/** Voice Studio (TASK-006) — voice profiles, character assignment, and queuing dialogue for synthesis. */
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createBibleService } from '@/application/services/bibleService';
import { createGenerationService } from '@/application/services/generationService';
import {
  assignVoiceProfileAction,
  createVoiceProfileAction,
  updateVoiceProfileAction,
  deleteVoiceProfileAction,
  enqueueVoiceGenerationAction,
} from '@/app/actions';
import { VoiceStudio } from '@/components/VoiceStudio';

export const dynamic = 'force-dynamic';

export default async function VoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const bibles = createBibleService(studio);
  const generations = createGenerationService(studio);

  const [voiceProfiles, characters, shotList] = await Promise.all([
    bibles.listVoiceProfiles(slug),
    bibles.listCharacters(slug),
    studio.shots.listByProject(project.id),
  ]);

  const speakingShots = shotList.filter((shot) => shot.dialogue.trim().length > 0);

  const shotVoiceState = await Promise.all(
    speakingShots.map(async (shot) => {
      const [shotGenerations, shotAssets] = await Promise.all([
        generations.listForShot(shot.id),
        studio.assets.list(project.id, { shotId: shot.id, kind: 'voice', limit: 10 }),
      ]);
      return {
        shot,
        voiceGenerations: shotGenerations.filter((generation) => generation.kind === 'voice'),
        voiceAssets: shotAssets,
      };
    }),
  );

  return (
    <VoiceStudio
      projectLanguage={project.language}
      voiceProfiles={voiceProfiles}
      characters={characters}
      shotVoiceState={shotVoiceState}
      createProfileAction={createVoiceProfileAction.bind(null, slug)}
      updateProfileAction={updateVoiceProfileAction.bind(null, slug)}
      deleteProfileAction={deleteVoiceProfileAction.bind(null, slug)}
      assignProfileAction={assignVoiceProfileAction.bind(null, slug)}
      enqueueAction={enqueueVoiceGenerationAction.bind(null, slug)}
    />
  );
}
