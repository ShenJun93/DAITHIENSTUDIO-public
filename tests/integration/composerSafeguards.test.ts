import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { useTempStudio } from '../helpers/studio';
import type { AssetRecord, ProjectRecord, ShotRecord } from '@/application/records';
import type { Studio } from '@/application/ports';

const env = useTempStudio('composer-safeguards');
const execFileAsync = promisify(execFile);
const { buildStudio } = await import('@/infrastructure/container');
const { getDb } = await import('@/infrastructure/db/client');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createComposerService } = await import('@/application/services/composerService');

describe('Composer media safeguards (Integration)', () => {
  let studio: Studio;
  let composer: ReturnType<typeof createComposerService>;

  beforeAll(() => {
    runMigrations();
    studio = buildStudio(getDb());
    composer = createComposerService(studio);
  });

  afterAll(() => {
    env.cleanup();
  });

  async function projectWithShot(label: string, durationSeconds = 0.5): Promise<{
    project: ProjectRecord;
    shot: ShotRecord;
  }> {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const project = await studio.projects.create({
      workspaceId,
      ownerId,
      slug: `composer-safe-${label}-${randomUUID()}`,
      title: `Composer ${label}`,
      description: '',
      genre: 'action',
      format: 'short-film',
      targetAudience: 'all',
      durationTargetSeconds: 10,
      aspectRatio: '16:9',
      stylePresetKey: undefined,
      costLimitUsd: 0,
      platform: 'youtube',
      language: 'vi-VN',
      secondaryAspectRatios: [],
      frameRate: 24,
      resolution: '320x180',
      creativeBrief: {},
    });
    const scene = await studio.scenes.create(project.id, {
      code: 'SC01',
      number: 1,
      episodeId: null,
      title: 'Scene 1',
      timeOfDay: 'day',
      summary: '',
      action: '',
      emotion: '',
      visualGoal: '',
      audioGoal: '',
      durationSeconds,
      locationId: 'LOC1',
      characters: [],
      status: 'approved',
      dialogue: [],
    });
    const shot = await studio.shots.create(project.id, {
      code: 'SH01',
      shotNumber: 1,
      episodeId: null,
      sceneId: scene.id,
      title: 'Shot 1',
      description: '',
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'static' },
      location: null,
      lens: '50mm',
      durationSeconds,
      dialogue: '',
      emotion: '',
      lighting: '',
      characters: [],
      props: [],
      visualEffects: [],
      soundEffects: [],
      continuity: {
        incoming: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } },
        outgoing: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } },
        intentionalChanges: [],
      },
      aspectRatio: '16:9',
      importance: 'normal',
    });
    return { project, shot };
  }

  async function registerApprovedVideo(
    project: ProjectRecord,
    shot: ShotRecord,
    input: { storageKey: string; mimeType: string; bytes?: Buffer },
  ): Promise<AssetRecord> {
    const stored = input.bytes
      ? await studio.storage.put(input.storageKey, input.bytes, input.mimeType)
      : null;
    const asset = await studio.assets.register({
      projectId: project.id,
      shotId: shot.id,
      generationId: null,
      kind: 'video',
      name: 'approved input',
      storageKey: stored?.key ?? input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: stored?.sizeBytes ?? 1,
      checksum: stored?.checksum ?? 'missing-file',
      width: 320,
      height: 180,
      durationSeconds: shot.durationSeconds,
      tags: [],
      metadata: {},
    });
    return studio.assets.setApproval(asset.id, 'approved');
  }

  async function expectNoExport(projectId: string): Promise<void> {
    expect(await studio.exports.listByProject(projectId)).toEqual([]);
    expect(await studio.assets.list(projectId, { kind: 'export' })).toEqual([]);
  }

  it('Reject unsafe Composer media without leaving partial output', async () => {
    const { project, shot } = await projectWithShot('path-escape');
    await registerApprovedVideo(project, shot, {
      storageKey: '../outside.mp4',
      mimeType: 'video/mp4',
    });

    await expect(
      composer.composeVideo({ projectId: project.id, resolution: '320x180', fps: 24 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expectNoExport(project.id);
  });

  it('rejects an approved video record with an unsupported MIME type', async () => {
    const { project, shot } = await projectWithShot('unsupported-mime');
    await registerApprovedVideo(project, shot, {
      storageKey: `projects/${project.slug}/videos/input.svg`,
      mimeType: 'image/svg+xml',
      bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });

    await expect(
      composer.composeVideo({ projectId: project.id, resolution: '320x180', fps: 24 }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    await expectNoExport(project.id);
  });

  it('rejects a missing approved video file without persisting output', async () => {
    const { project, shot } = await projectWithShot('missing-file');
    await registerApprovedVideo(project, shot, {
      storageKey: `projects/${project.slug}/videos/missing.mp4`,
      mimeType: 'video/mp4',
    });

    await expect(
      composer.composeVideo({ projectId: project.id, resolution: '320x180', fps: 24 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expectNoExport(project.id);
  });

  it('rejects malformed MP4 bytes without persisting output', async () => {
    const { project, shot } = await projectWithShot('malformed-file');
    await registerApprovedVideo(project, shot, {
      storageKey: `projects/${project.slug}/videos/malformed.mp4`,
      mimeType: 'video/mp4',
      bytes: Buffer.from('not-an-mp4'),
    });

    await expect(
      composer.composeVideo({ projectId: project.id, resolution: '320x180', fps: 24 }),
    ).rejects.toMatchObject({ code: 'MEDIA_FAILED' });
    await expectNoExport(project.id);
  });

  it('probes a real composed MP4 and preserves approved source immutability', async () => {
    const fixturePath = join(env.root, 'fixture.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=blue:s=320x180:r=24:d=0.5',
      '-an',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      fixturePath,
    ], { timeout: 20_000, windowsHide: true });

    const { project, shot } = await projectWithShot('real-output');
    const source = await registerApprovedVideo(project, shot, {
      storageKey: `projects/${project.slug}/videos/source.mp4`,
      mimeType: 'video/mp4',
      bytes: await readFile(fixturePath),
    });

    const result = await composer.composeVideo({
      projectId: project.id,
      resolution: '320x180',
      fps: 24,
    });
    const outputPath = await studio.storage.localPath(result.export.storageKey);
    const probe = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate',
      '-of', 'json',
      outputPath,
    ], { timeout: 20_000, windowsHide: true });
    const metadata = JSON.parse(String(probe.stdout)) as {
      streams: { width: number; height: number; avg_frame_rate: string }[];
    };

    expect(metadata.streams[0]).toEqual({ width: 320, height: 180, avg_frame_rate: '24/1' });
    expect(result.asset).toMatchObject({ width: 320, height: 180, mimeType: 'video/mp4' });
    expect((result.asset.metadata as { fps?: number }).fps).toBe(24);
    expect((await studio.assets.parents(result.asset.id)).map((relation) => relation.parentId)).toContain(source.id);
    expect(await studio.assets.byId(source.id)).toEqual(source);
    await expect(studio.assets.setApproval(source.id, 'rejected')).rejects.toMatchObject({
      code: 'IMMUTABLE_APPROVED_ASSET',
    });
  }, 30_000);

  it('turns an approved Hybrid storyboard image into a real motion clip', async () => {
    const fixturePath = join(env.root, 'storyboard.png');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=orange:s=320x180',
      '-frames:v', '1',
      fixturePath,
    ], { timeout: 20_000, windowsHide: true });

    const { project, shot } = await projectWithShot('real-storyboard-image', 0.5);
    const stored = await studio.storage.put(
      `projects/${project.slug}/references/storyboard.png`,
      await readFile(fixturePath),
      'image/png',
    );
    const source = await studio.assets.register({
      projectId: project.id,
      shotId: null,
      generationId: null,
      kind: 'image',
      name: 'Approved storyboard keyframe',
      storageKey: stored.key,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      width: 320,
      height: 180,
      durationSeconds: null,
      tags: ['storyboard'],
      metadata: { originType: 'manual-import' },
    });
    await studio.assets.setApproval(source.id, 'approved');
    await studio.productionAssetBindings.bind({
      projectId: project.id,
      assetId: source.id,
      targetType: 'shot',
      targetId: shot.id,
      targetVersionId: '',
      role: 'storyboard-keyframe',
    });

    const result = await composer.composeVideo({
      projectId: project.id,
      resolution: '320x180',
      fps: 24,
    });
    const outputPath = await studio.storage.localPath(result.export.storageKey);
    const probe = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate',
      '-of', 'json',
      outputPath,
    ], { timeout: 20_000, windowsHide: true });
    const metadata = JSON.parse(String(probe.stdout)) as {
      streams: { width: number; height: number; avg_frame_rate: string }[];
    };

    expect(metadata.streams[0]).toEqual({ width: 320, height: 180, avg_frame_rate: '24/1' });
    expect(result.export.summary.productionStrategy).toBe('hybrid');
    expect((await studio.assets.parents(result.asset.id)).map((relation) => relation.parentId)).toContain(source.id);
  }, 30_000);
});
