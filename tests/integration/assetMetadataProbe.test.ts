/**
 * TASK-REFINE-003: the manual Upload path now probes and persists
 * width/height/durationSeconds for real image/video/audio files, using the
 * same real SQLite file and local storage driver as assetUpload.test.ts.
 * Fixtures are real, tiny, deterministic media (see tests/fixtures/media/).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';
import { TINY_IMAGE_PNG_BASE64 } from '../fixtures/media/tinyImagePngBase64';
import { TINY_VIDEO_MP4_BASE64 } from '../fixtures/media/tinyVideoMp4Base64';
import { TINY_AUDIO_WAV_BASE64 } from '../fixtures/media/tinyAudioWavBase64';

const env = useTempStudio('assetMetadataProbe');

const imageBuffer = () => Buffer.from(TINY_IMAGE_PNG_BASE64, 'base64');
const videoBuffer = () => Buffer.from(TINY_VIDEO_MP4_BASE64, 'base64');
const audioBuffer = () => Buffer.from(TINY_AUDIO_WAV_BASE64, 'base64');

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createAssetService } = await import('@/application/services/assetService');
const { createExportService } = await import('@/application/services/exportService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const assets = createAssetService(studio);
const exportService = createExportService(studio);

let projectSlug = '';
let shotId = '';

beforeAll(async () => {
  runMigrations();
  const project = await projects.create({
    title: 'Asset Metadata Probe Test',
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 60,
    stylePresetKey: STYLE_PRESETS[0]?.key,
  });
  projectSlug = project.slug;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
  await scripts.buildShots(projectSlug);
  const current = await projects.get(projectSlug);
  const [shot] = await studio.shots.listByProject(current.id);
  shotId = shot!.id;
});

afterAll(() => {
  env.cleanup();
});

describe('asset upload metadata probing', () => {
  it('persists width and height for a real uploaded image, and reload preserves them', async () => {
    const uploaded = await assets.upload(
      projectSlug,
      { kind: 'image', name: 'real-image.png', shotId },
      { fileName: 'real-image.png', mimeType: 'image/png', data: imageBuffer() },
    );

    expect(uploaded.width).toBe(64);
    expect(uploaded.height).toBe(48);
    expect(uploaded.durationSeconds).toBeNull();

    // "Reload" = a fresh read straight from the database, not the value
    // returned by the write itself.
    const reloaded = await assets.byId(uploaded.id);
    expect(reloaded?.width).toBe(64);
    expect(reloaded?.height).toBe(48);
    expect(reloaded?.shotId).toBe(shotId);
    expect(reloaded?.projectId).toBe(uploaded.projectId);
  });

  it('persists width, height and duration for a real uploaded video, and reload preserves them', async () => {
    const uploaded = await assets.upload(
      projectSlug,
      { kind: 'video', name: 'real-video.mp4', shotId },
      { fileName: 'real-video.mp4', mimeType: 'video/mp4', data: videoBuffer() },
    );

    expect(uploaded.width).toBe(32);
    expect(uploaded.height).toBe(24);
    expect(uploaded.durationSeconds).toBeGreaterThan(0.8);
    expect(uploaded.durationSeconds).toBeLessThan(1.2);

    const reloaded = await assets.byId(uploaded.id);
    expect(reloaded?.width).toBe(32);
    expect(reloaded?.height).toBe(24);
    expect(reloaded?.durationSeconds).toBeCloseTo(uploaded.durationSeconds!, 3);
  });

  it('persists duration for a real uploaded audio file, and reload preserves it', async () => {
    const uploaded = await assets.upload(
      projectSlug,
      { kind: 'voice', name: 'real-audio.wav', shotId },
      { fileName: 'real-audio.wav', mimeType: 'audio/wav', data: audioBuffer() },
    );

    expect(uploaded.width).toBeNull();
    expect(uploaded.height).toBeNull();
    expect(uploaded.durationSeconds).toBeGreaterThan(0.4);
    expect(uploaded.durationSeconds).toBeLessThan(0.6);

    const reloaded = await assets.byId(uploaded.id);
    expect(reloaded?.durationSeconds).toBeCloseTo(uploaded.durationSeconds!, 3);
  });

  it('does not fabricate metadata for an unsupported or corrupt upload', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    const uploaded = await assets.upload(
      projectSlug,
      { kind: 'image', name: 'vector.svg' },
      { fileName: 'vector.svg', mimeType: 'image/svg+xml', data: svg },
    );

    // SVG is intentionally not in the probed image set (vector, ambiguous
    // pixel dimensions) — the upload still succeeds, metadata stays null,
    // never a fabricated 0.
    expect(uploaded.width).toBeNull();
    expect(uploaded.height).toBeNull();
  });

  it('keeps probed metadata correctly isolated per project', async () => {
    const other = await projects.create({
      title: 'Other Project',
      description: '',
      aspectRatio: '16:9',
      durationTargetSeconds: 60,
      stylePresetKey: STYLE_PRESETS[0]?.key,
    });

    const otherAssets = await assets.list(other.slug, {});
    expect(otherAssets).toHaveLength(0);

    const primaryAssets = await assets.list(projectSlug, {});
    expect(primaryAssets.length).toBeGreaterThan(0);
    expect(primaryAssets.every((asset) => asset.projectId !== other.id)).toBe(true);
  });

  it('exposes the same probed values in the exported project-package', async () => {
    const pkg = await exportService.buildPackage(projectSlug);
    const packageImage = (pkg.assets as { name: string; width: number | null; height: number | null }[]).find(
      (asset) => asset.name === 'real-image.png',
    );
    const packageVideo = (
      pkg.assets as { name: string; width: number | null; height: number | null; durationSeconds: number | null }[]
    ).find((asset) => asset.name === 'real-video.mp4');

    expect(packageImage?.width).toBe(64);
    expect(packageImage?.height).toBe(48);
    expect(packageVideo?.width).toBe(32);
    expect(packageVideo?.height).toBe(24);
    expect(packageVideo?.durationSeconds).toBeGreaterThan(0.8);
  });
});
