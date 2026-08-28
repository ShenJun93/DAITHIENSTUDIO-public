/**
 * Location / Prop / Style bible editing (TASK-009), against a real SQLite
 * file: each edit writes the next immutable snapshot (rule 6) and reaches a
 * freshly compiled prompt.
 *
 * Location and prop snapshots are *pinned on the shot* at build time (same as
 * characters), so an edit only shows up in a compiled prompt once the shot is
 * rebuilt after the edit. Style is different: `bibleService.currentStyle()`
 * resolves the project's style live at compile time, so a style edit shows up
 * immediately with no rebuild.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('locationPropStyleBibleEditing');

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createBibleService, snapshotIdFor } = await import('@/application/services/bibleService');
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
    title: 'Location Prop Style Editing Test',
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

describe('location/prop/style bible editing', () => {
  it("Editing a location's prompt block persists and reaches a compiled prompt", async () => {
    const [location] = await bibles.listLocations(projectSlug);
    expect(location).toBeDefined();

    await bibles.updateLocation(location!.id, { promptBlock: 'hang động phát sáng màu lam ngọc' });

    // Locations pin their version on the shot at build time.
    await scripts.buildShots(projectSlug);
    const project = await projects.get(projectSlug);
    const shotList = await studio.shots.listByProject(project.id);
    const atLocation = shotList.find((shot) => shot.locationId === location!.id);
    expect(atLocation).toBeDefined();

    const built = await prompts.buildForShot(atLocation!.id, 'image');
    expect(built.version.compiled).toContain('hang động phát sáng màu lam ngọc');
  });

  it("Editing a prop's material persists and reaches a compiled prompt", async () => {
    const project = await projects.get(projectSlug);
    const prop = await bibles.createProp(projectSlug, {
      name: 'Sổ tay cũ',
      details: { material: 'giấy dó cũ' },
    });
    await bibles.updateProp(prop.id, { details: { material: 'kim loại bạc phát sáng' } });
    const updatedProp = (await bibles.listProps(projectSlug)).find((p) => p.id === prop.id)!;

    const [shot] = await studio.shots.listByProject(project.id);
    expect(shot).toBeDefined();
    await studio.shots.update(shot!.id, {
      props: [
        {
          propId: updatedProp.id,
          versionId: snapshotIdFor(updatedProp.code, updatedProp.currentVersion),
          heldBy: null,
          state: 'intact',
        },
      ],
    });

    const built = await prompts.buildForShot(shot!.id, 'image');
    expect(built.version.compiled).toContain('kim loại bạc phát sáng');
  });

  it("Editing a style's prompt block persists and reaches a compiled prompt", async () => {
    const project = await projects.get(projectSlug);
    const [shot] = await studio.shots.listByProject(project.id);
    expect(project.styleId).toBeTruthy();

    await bibles.updateStyle(project.styleId!, { promptBlock: 'phong cách tranh lụa thủy mặc hiện đại' });

    // Style is resolved live at compile time — no rebuild needed.
    const built = await prompts.buildForShot(shot!.id, 'video');
    expect(built.version.compiled).toContain('phong cách tranh lụa thủy mặc hiện đại');
  });

  it("Assigning a prop's owner character persists and survives a reload", async () => {
    const [character] = await bibles.listCharacters(projectSlug);
    const prop = await bibles.createProp(projectSlug, { name: 'Kiếm gỗ' });
    expect(prop.ownerCharacterId).toBeNull();

    await bibles.updateProp(prop.id, { ownerCharacterId: character!.id });

    // "Reload" = a fresh read straight from the database.
    const reloaded = (await bibles.listProps(projectSlug)).find((p) => p.id === prop.id);
    expect(reloaded?.ownerCharacterId).toBe(character!.id);
  });

  it('Editing a location, prop or style with an empty name is rejected', async () => {
    const [location] = await bibles.listLocations(projectSlug);
    const [prop] = await bibles.listProps(projectSlug);
    const project = await projects.get(projectSlug);

    await expect(bibles.updateLocation(location!.id, { name: '' })).rejects.toThrow();
    await expect(bibles.updateProp(prop!.id, { name: '' })).rejects.toThrow();
    await expect(bibles.updateStyle(project.styleId!, { name: '' })).rejects.toThrow();
  });
});
