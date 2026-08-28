import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('creative-workspace-entity-browser');
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createBibleService } = await import('@/application/services/bibleService');
const { createCreativeWorkspaceService } = await import('@/application/services/creativeWorkspaceService');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const bibles = createBibleService(studio);
const workspace = createCreativeWorkspaceService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

describe('Character Browser and Location Browser persisted projection', () => {
  it('Character Browser empty state: a project with no characters yields zero entries without writing data', async () => {
    const project = await projects.create({ title: 'Empty Bible Project', format: 'motion-comic', platform: 'youtube', aspectRatio: '16:9', durationTargetSeconds: 60 });
    const before = await projects.get(project.slug);
    const result = await workspace.characterBrowser(project.slug);
    const after = await projects.get(project.slug);

    expect(result.entries).toEqual([]);
    expect(after).toEqual(before);
  });

  it('Location Browser empty state: a project with no locations yields zero entries', async () => {
    const project = await projects.create({ title: 'Empty Bible Project 2', format: 'motion-comic', platform: 'youtube', aspectRatio: '16:9', durationTargetSeconds: 60 });
    const result = await workspace.locationBrowser(project.slug);
    expect(result.entries).toEqual([]);
  });

  it('entity selection data: a manually created character with no scenes/shots reports zero usage and its real fields', async () => {
    const project = await projects.create({ title: 'Manual Character Project', format: 'motion-comic', platform: 'youtube', aspectRatio: '16:9', durationTargetSeconds: 60 });
    const character = await bibles.createCharacter(project.slug, { name: 'Unused Extra', role: 'background' });

    const result = await workspace.characterBrowser(project.slug);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0]!;
    expect(entry.id).toBe(character.id);
    expect(entry.code).toBe(character.code);
    expect(entry.name).toBe('Unused Extra');
    expect(entry.subtitle).toBe('background');
    expect(entry.sceneUsage).toBe(0);
    expect(entry.shotUsage).toBe(0);
    expect(entry.lockEnabled).toBe(true);
  });

  it('Location Browser: lockEnabled is null (unsupported), never a fabricated boolean', async () => {
    const project = await projects.create({ title: 'Manual Location Project', format: 'motion-comic', platform: 'youtube', aspectRatio: '16:9', durationTargetSeconds: 60 });
    await bibles.createLocation(project.slug, { name: 'Unused Room', type: 'interior' });

    const result = await workspace.locationBrowser(project.slug);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.lockEnabled).toBeNull();
  });

  it('Character Browser populated state: derives non-zero scene and shot usage from persisted scenes/shots after script parsing, without hardcoding a project name', async () => {
    const project = await projects.create({ title: 'Script Usage Project', aspectRatio: '16:9', durationTargetSeconds: 120 });
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    await scripts.buildShots(project.slug);

    const characterResult = await workspace.characterBrowser(project.slug);
    const locationResult = await workspace.locationBrowser(project.slug);

    expect(characterResult.entries.length).toBeGreaterThan(0);
    expect(locationResult.entries.length).toBeGreaterThan(0);
    expect(characterResult.entries.some((entry) => entry.sceneUsage > 0)).toBe(true);
    expect(characterResult.entries.some((entry) => entry.shotUsage > 0)).toBe(true);
    expect(locationResult.entries.some((entry) => entry.sceneUsage > 0)).toBe(true);
    expect(locationResult.entries.some((entry) => entry.shotUsage > 0)).toBe(true);

    // Every character/location auto-created by parsing starts as an unlocked, draft snapshot —
    // the lock-visibility rule surfaces a real, honest warning, not a fabricated one.
    for (const entry of characterResult.entries) {
      expect(entry.status).toBe('draft');
      expect(entry.warnings.length === 0 || entry.warnings[0]!.includes('Lock disabled')).toBe(true);
    }
  });

  it('Slice 2 entity browsers agree with the persisted Bible service on the same character/location counts (no divergent read model)', async () => {
    const project = await projects.create({ title: 'Consistency Project', aspectRatio: '16:9', durationTargetSeconds: 90 });
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    await scripts.buildShots(project.slug);

    const [persistedCharacters, persistedLocations] = await Promise.all([
      bibles.listCharacters(project.slug),
      bibles.listLocations(project.slug),
    ]);
    const characterResult = await workspace.characterBrowser(project.slug);
    const locationResult = await workspace.locationBrowser(project.slug);

    expect(characterResult.entries.length).toBe(persistedCharacters.length);
    expect(locationResult.entries.length).toBe(persistedLocations.length);
    expect(characterResult.entries.length).toBeGreaterThan(0);
    expect(locationResult.entries.length).toBeGreaterThan(0);
    expect(new Set(characterResult.entries.map((entry) => entry.id))).toEqual(new Set(persistedCharacters.map((character) => character.id)));
  });
});
