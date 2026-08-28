/**
 * Asset upload widget (TASK-007), against a real SQLite file, the real local
 * storage driver and the real checksum-dedup path in `assetService.upload()`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('assetUpload');

// The magic-byte signature check added in TASK-010 Phase 2 validates declared
// MIME against actual content, so a PNG-declared fixture needs the real
// 8-byte PNG signature ahead of its (still synthetic) payload.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngFixture = (payload: string): Buffer => Buffer.concat([PNG_SIGNATURE, Buffer.from(payload)]);

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createAssetService } = await import('@/application/services/assetService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const assets = createAssetService(studio);

let projectSlug = '';

beforeAll(async () => {
  runMigrations();
  const project = await projects.create({
    title: 'Asset Upload Test',
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: STYLE_PRESETS[0]?.key,
  });
  projectSlug = project.slug;
});

afterAll(() => {
  env.cleanup();
});

describe('asset upload', () => {
  it('Uploading a file through the action persists an asset and it survives a reload', async () => {
    const before = await assets.list(projectSlug, {});
    expect(before).toHaveLength(0);

    const uploaded = await assets.upload(
      projectSlug,
      { kind: 'image', name: 'reference-01.png' },
      { fileName: 'reference-01.png', mimeType: 'image/png', data: pngFixture('fake-png-bytes-one') },
    );

    // "Reload" = a fresh read straight from the database.
    const after = await assets.list(projectSlug, {});
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(uploaded.id);
    expect(after[0]?.name).toBe('reference-01.png');
  });

  it('An identical re-upload reuses the existing asset instead of creating a duplicate', async () => {
    const first = await assets.upload(
      projectSlug,
      { kind: 'image', name: 'dup.png' },
      { fileName: 'dup.png', mimeType: 'image/png', data: pngFixture('identical-bytes') },
    );
    const second = await assets.upload(
      projectSlug,
      { kind: 'image', name: 'dup-again.png' },
      { fileName: 'dup-again.png', mimeType: 'image/png', data: pngFixture('identical-bytes') },
    );

    expect(second.id).toBe(first.id);
  });

  it('An empty file is refused with a validation error', async () => {
    await expect(
      assets.upload(
        projectSlug,
        { kind: 'image', name: 'empty.png' },
        { fileName: 'empty.png', mimeType: 'image/png', data: Buffer.alloc(0) },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('A file over the 50 MB limit is refused with a validation error', async () => {
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1);
    await expect(
      assets.upload(
        projectSlug,
        { kind: 'image', name: 'huge.png' },
        { fileName: 'huge.png', mimeType: 'image/png', data: oversized },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  }, 20_000);

  it('Uploading with a shot association stores the asset under that shot', async () => {
    await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(projectSlug);
    await scripts.buildShots(projectSlug);
    const project = await projects.get(projectSlug);
    const [shot] = await studio.shots.listByProject(project.id);
    expect(shot).toBeDefined();

    const uploaded = await assets.upload(
      projectSlug,
      { kind: 'image', name: 'plate.png', shotId: shot!.id },
      { fileName: 'plate.png', mimeType: 'image/png', data: pngFixture('shot-plate-bytes') },
    );

    expect(uploaded.shotId).toBe(shot!.id);
  });
});
