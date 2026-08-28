import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('hybrid-production');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngFixture = (payload: string): Buffer => Buffer.concat([PNG_SIGNATURE, Buffer.from(payload)]);

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createAssetService } = await import('@/application/services/assetService');
const { createQualityService } = await import('@/application/services/qualityService');
const { createBibleService } = await import('@/application/services/bibleService');
const { createProductionStrategyService } = await import('@/application/services/productionStrategyService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const assets = createAssetService(studio);
const quality = createQualityService(studio);
const bibles = createBibleService(studio);
const production = createProductionStrategyService(studio);

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

async function createProject(title: string, withShots = false) {
  const project = await projects.create({
    title,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: STYLE_PRESETS[0]?.key,
  });
  if (withShots) {
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    await scripts.buildShots(project.slug);
  }
  return projects.get(project.slug);
}

async function approvedImage(projectSlug: string, name: string) {
  const asset = await assets.upload(
    projectSlug,
    { kind: 'image', name },
    { fileName: name, mimeType: 'image/png', data: pngFixture(name) },
  );
  await quality.checkAsset(asset.id);
  return assets.decide(asset.id, 'approved', 'Approved as a production reference.', null);
}

describe('Hybrid and Auto production acquisition', () => {
  it('Persist the selected Hybrid or Auto production strategy', async () => {
    const project = await createProject('Persist Production Strategy');

    await production.setStrategy(project.slug, 'auto');
    expect((await projects.get(project.slug)).productionStrategy).toBe('auto');

    await production.setStrategy(project.slug, 'hybrid');
    expect((await projects.get(project.slug)).productionStrategy).toBe('hybrid');
  });

  it('Bind an imported reference to an immutable Bible snapshot', async () => {
    const project = await createProject('Immutable Hybrid Binding', true);
    const [character] = await bibles.listCharacters(project.slug);
    expect(character).toBeDefined();
    const asset = await approvedImage(project.slug, 'character-anchor.png');
    const snapshotId = `${character!.code}_V${character!.currentVersion}`;

    const binding = await production.bind(project.slug, {
      assetId: asset.id,
      targetType: 'character',
      targetId: character!.id,
      targetVersionId: snapshotId,
      role: 'identity-anchor',
    });

    expect(binding).toMatchObject({ assetId: asset.id, targetVersionId: snapshotId });
    await expect(production.listBindings(project.slug)).resolves.toContainEqual(binding);
    await expect(assets.lineage(asset.id)).resolves.toMatchObject({
      bibleVersions: [{ kind: 'character', code: character!.code, versionId: snapshotId }],
    });
  });

  it('Report missing Hybrid anchors before storyboard production', async () => {
    const project = await createProject('Hybrid Missing Anchors', true);
    const shots = await studio.shots.listByProject(project.id);
    const expectedSnapshotIds = new Set<string>();
    for (const shot of shots) {
      for (const ref of shot.characters) if (ref.versionId) expectedSnapshotIds.add(ref.versionId);
      if (shot.locationVersionId) expectedSnapshotIds.add(shot.locationVersionId);
      for (const ref of shot.props) if (ref.versionId) expectedSnapshotIds.add(ref.versionId);
    }
    const [style] = await bibles.listStyles(project.slug);
    if (style) expectedSnapshotIds.add(`${style.code}_V${style.currentVersion}`);

    const readiness = await production.readiness(project.slug);

    expect(readiness.strategy).toBe('hybrid');
    expect(readiness.readyForStoryboard).toBe(false);
    expect(new Set(readiness.missingAnchorSnapshotIds)).toEqual(expectedSnapshotIds);
    expect(readiness.missingAnchorSnapshotIds.every((id) => /^(CHAR|LOC|PROP|STY)\d+_V\d+$/.test(id))).toBe(true);
  });

  it('Keep Auto acquisition provider-only', async () => {
    const project = await createProject('Auto Provider Only', true);
    await production.setStrategy(project.slug, 'auto');
    const [shot] = await studio.shots.listByProject(project.id);
    expect(shot).toBeDefined();
    const manualAsset = await approvedImage(project.slug, 'manual-storyboard.png');
    await production.bind(project.slug, {
      assetId: manualAsset.id,
      targetType: 'shot',
      targetId: shot!.id,
      targetVersionId: '',
      role: 'storyboard-keyframe',
    });

    const readiness = await production.readiness(project.slug);

    expect(readiness.strategy).toBe('auto');
    expect(readiness.shots.find((candidate) => candidate.shotId === shot!.id)).toMatchObject({
      ready: false,
      source: 'missing',
      assetId: null,
    });
    expect(readiness.readyForCompose).toBe(false);
  });
});
