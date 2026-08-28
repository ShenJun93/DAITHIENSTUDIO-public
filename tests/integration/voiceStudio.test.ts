/**
 * Voice Studio (TASK-006), against a real SQLite file and the real mock
 * provider: voice profiles persist, assigning one to a character survives a
 * reload through the normal bible-versioning path, and queuing a voice
 * generation actually produces a voice asset without spending twice on an
 * identical request.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('voiceStudio');

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createBibleService } = await import('@/application/services/bibleService');
const { createGenerationService } = await import('@/application/services/generationService');
const { createWorker } = await import('@/infrastructure/queue/worker');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const bibles = createBibleService(studio);
const generations = createGenerationService(studio);

let projectSlug = '';
let projectId = '';
let speakingShotId = '';
let firstCharacterId = '';

beforeAll(async () => {
  runMigrations();

  const project = await projects.create({
    title: 'Voice Studio Test',
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: STYLE_PRESETS[0]?.key,
  });
  projectId = project.id;
  projectSlug = project.slug;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
  await scripts.buildShots(projectSlug);

  const shotList = await studio.shots.listByProject(projectId);
  const speaking = shotList.find((shot) => shot.dialogue.trim().length > 0 && shot.characters.length > 0);
  if (!speaking) throw new Error('Demo fixture produced no speaking shot with a cast — fixture assumption broken.');
  speakingShotId = speaking.id;
  firstCharacterId = speaking.characters[0]!.characterId;
});

afterAll(() => {
  env.cleanup();
});

describe('voice studio', () => {
  it('Creating a voice profile persists it and survives a reload', async () => {
    const before = await bibles.listVoiceProfiles(projectSlug);
    expect(before).toHaveLength(0);

    await bibles.createVoiceProfile(projectSlug, {
      name: 'Triệu Ngốc — vi-VN',
      language: 'vi-VN',
      voiceName: 'demo-vi',
      speed: 1,
      pitch: 0,
      emotion: 'neutral',
    });

    // "Reload" = a fresh read straight from the database.
    const after = await bibles.listVoiceProfiles(projectSlug);
    expect(after).toHaveLength(1);
    expect(after[0]?.name).toBe('Triệu Ngốc — vi-VN');
    expect(after[0]?.voiceName).toBe('demo-vi');
  });

  it('Assigning a voice profile to a character survives a reload', async () => {
    const [profile] = await bibles.listVoiceProfiles(projectSlug);
    expect(profile).toBeDefined();

    await bibles.updateCharacter(firstCharacterId, { voiceProfileId: profile!.id });

    const characters = await bibles.listCharacters(projectSlug);
    const reloaded = characters.find((character) => character.id === firstCharacterId);
    expect(reloaded?.voiceProfileId).toBe(profile!.id);
  });

  it('Queuing a voice generation produces a voice asset for the shot', async () => {
    const shot = await studio.shots.byId(speakingShotId);
    expect(shot).toBeDefined();

    const result = await generations.enqueue({
      projectId,
      shotId: speakingShotId,
      kind: 'voice',
      prompt: shot!.dialogue,
      params: { language: 'vi-VN', voiceName: 'demo-vi', speed: 1 },
      referenceAssetIds: [],
      priority: 20,
    });
    expect(result.reused).toBe(false);

    await createWorker(studio, { workerId: 'test' }).drain();

    const voiceAssets = await studio.assets.list(projectId, { shotId: speakingShotId, kind: 'voice' });
    expect(voiceAssets.length).toBeGreaterThan(0);
  });

  it('An identical voice request is not spent twice', async () => {
    const shot = await studio.shots.byId(speakingShotId);

    const result = await generations.enqueue({
      projectId,
      shotId: speakingShotId,
      kind: 'voice',
      prompt: shot!.dialogue,
      params: { language: 'vi-VN', voiceName: 'demo-vi', speed: 1 },
      referenceAssetIds: [],
      priority: 20,
    });

    expect(result.reused).toBe(true);
  });

  it('Creating a voice profile with a blank name is rejected', async () => {
    await expect(
      bibles.createVoiceProfile(projectSlug, { name: '', language: 'vi-VN', voiceName: '', speed: 1, pitch: 0, emotion: '' }),
    ).rejects.toThrow();

    const profiles = await bibles.listVoiceProfiles(projectSlug);
    expect(profiles).toHaveLength(1); // still just the one from the first scenario
  });
});
