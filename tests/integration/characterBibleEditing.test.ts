/**
 * Character bible editing (TASK-008), against a real SQLite file: an edit
 * writes the next immutable CHARnnn_Vn snapshot (rule 6), the previous
 * snapshot stays readable, and — because a shot pins whatever version the
 * character was at when the shot was built — an edit made *before* building
 * shots is what a freshly compiled prompt actually sees.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('characterBibleEditing');

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createBibleService } = await import('@/application/services/bibleService');
const { createPromptService } = await import('@/application/services/promptService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const bibles = createBibleService(studio);
const prompts = createPromptService(studio);

let projectSlug = '';

beforeAll(async () => {
  runMigrations();
  const project = await projects.create({
    title: 'Character Bible Editing Test',
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: STYLE_PRESETS[0]?.key,
  });
  projectSlug = project.slug;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
});

afterAll(() => {
  env.cleanup();
});

describe('character bible editing', () => {
  it("Editing a character's identity persists and survives a reload", async () => {
    const [character] = await bibles.listCharacters(projectSlug);
    expect(character).toBeDefined();

    await bibles.updateCharacter(character!.id, {
      identity: { hair: 'bạc trắng', eyes: 'nâu đậm' },
      variable: { costume: 'áo choàng thiên thanh mới' },
    });

    // "Reload" = a fresh read straight from the database.
    const reloaded = (await bibles.listCharacters(projectSlug)).find((c) => c.id === character!.id);
    expect(reloaded?.identity.hair).toBe('bạc trắng');
    expect(reloaded?.identity.eyes).toBe('nâu đậm');
    expect(reloaded?.variable.costume).toBe('áo choàng thiên thanh mới');
  });

  it("Editing a character writes a new version and the previous snapshot is still readable", async () => {
    const [character] = await bibles.listCharacters(projectSlug);
    const versionBefore = character!.currentVersion;

    const updated = await bibles.updateCharacter(character!.id, { identity: { hair: 'đen tuyền' } });
    expect(updated.currentVersion).toBe(versionBefore + 1);

    const versions = await bibles.characterVersions(character!.id);
    const previous = versions.find((v) => v.version === versionBefore);
    expect(previous).toBeDefined();
    expect((previous!.payload as { identity: { hair: string } }).identity.hair).toBe('bạc trắng');
  });

  it('The compiled Character Lock text reflects an edited field', async () => {
    const [character] = await bibles.listCharacters(projectSlug);
    await bibles.updateCharacter(character!.id, { variable: { costume: 'giáp bạc phát sáng' } });

    // Shots pin whatever version a character is at *when the shot is built* —
    // building after the edit is what makes the edit visible to a prompt.
    await scripts.buildShots(projectSlug);
    const shotList = await studio.shots.listByProject((await projects.get(projectSlug)).id);
    const withCast = shotList.find((shot) => shot.characters.some((ref) => ref.characterId === character!.id));
    expect(withCast).toBeDefined();

    const built = await prompts.buildForShot(withCast!.id, 'image');
    expect(built.version.compiled).toContain('giáp bạc phát sáng');
  });

  it('Editing with an empty name is rejected', async () => {
    const [character] = await bibles.listCharacters(projectSlug);
    const nameBefore = character!.name;

    await expect(bibles.updateCharacter(character!.id, { name: '' })).rejects.toThrow();

    const reloaded = (await bibles.listCharacters(projectSlug)).find((c) => c.id === character!.id);
    expect(reloaded?.name).toBe(nameBefore);
  });

  it('An approved character can still be edited', async () => {
    const [character] = await bibles.listCharacters(projectSlug);
    const approved = await bibles.updateCharacter(character!.id, { status: 'approved' });
    expect(approved.status).toBe('approved');

    const edited = await bibles.updateCharacter(character!.id, { identity: { skinTone: 'rám nắng' } });
    expect(edited.currentVersion).toBe(approved.currentVersion + 1);
    expect(edited.status).toBe('approved');
  });
});
