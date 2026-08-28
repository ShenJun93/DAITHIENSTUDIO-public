import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('composer');

const { buildStudio, resetStudio } = await import('@/infrastructure/container');
const { getDb } = await import('@/infrastructure/db/client');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createComposerService } = await import('@/application/services/composerService');
const { createSoundStudioService } = await import('@/application/services/soundStudioService');
import type { Studio } from '@/application/ports';
import { randomUUID } from 'node:crypto';

describe('Composer Service (Integration)', () => {
  const db = getDb();
  let studio: Studio;
  let composerService: ReturnType<typeof createComposerService>;

  beforeAll(() => {
    runMigrations();
    const db = getDb();
    
    // Override media adapter for test to avoid needing real ffmpeg and real files
    const mockMedia = {
      isAvailable: async () => true,
      concatenateVideos: vi.fn().mockResolvedValue(Buffer.from('fake-video-content')),
    };
    
    studio = buildStudio(db, { media: mockMedia });
    composerService = createComposerService(studio);
  });

  afterAll(() => {
    env.cleanup();
  });

  it('Compose a playable final video from approved shot media', async () => {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const project = await studio.projects.create({
      workspaceId,
      ownerId,
      slug: `composer-test-${randomUUID()}`,
      title: 'Composer Test',
      description: 'Test project',
      genre: 'action',
      format: 'short-film',
      targetAudience: 'all',
      durationTargetSeconds: 60,
      aspectRatio: '16:9',
      stylePresetKey: undefined,
      costLimitUsd: 10,
      platform: 'youtube',
      language: 'vi-VN',
      secondaryAspectRatios: ['9:16'],
      frameRate: 24,
      resolution: '1920x1080',
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
      durationSeconds: 10,
      locationId: 'LOC1',
      characters: [],
      status: 'approved',
      dialogue: [],
    });

    const shot1 = await studio.shots.create(project.id, {
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
      durationSeconds: 5,
      dialogue: '',
      emotion: '',
      lighting: '',
      characters: [],
      props: [],
      visualEffects: [],
      soundEffects: [],
      continuity: { incoming: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, outgoing: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, intentionalChanges: [] },
      aspectRatio: '16:9',
      importance: 'normal',
    });

    const shot2 = await studio.shots.create(project.id, {
      code: 'SH02',
      shotNumber: 2,
      episodeId: null,
      sceneId: scene.id,
      title: 'Shot 2',
      description: '',
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'static' },
      location: null,
      lens: '50mm',
      durationSeconds: 5,
      dialogue: '',
      emotion: '',
      lighting: '',
      characters: [],
      props: [],
      visualEffects: [],
      soundEffects: [],
      continuity: { incoming: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, outgoing: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, intentionalChanges: [] },
      aspectRatio: '16:9',
      importance: 'normal',
    });

    // Create approved video assets for these shots
    const asset1 = await studio.assets.register({
      projectId: project.id,
      shotId: shot1.id,
      generationId: null,
      kind: 'video',
      name: 'video1',
      storageKey: 'mock1.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 100,
      checksum: '123',
      width: 1920,
      height: 1080,
      durationSeconds: 5,
      tags: [],
      metadata: {},
    });
    await studio.assets.setApproval(asset1.id, 'approved');

    const asset2 = await studio.assets.register({
      projectId: project.id,
      shotId: shot2.id,
      generationId: null,
      kind: 'video',
      name: 'video2',
      storageKey: 'mock2.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 100,
      checksum: '456',
      width: 1920,
      height: 1080,
      durationSeconds: 5,
      tags: [],
      metadata: {},
    });
    await studio.assets.setApproval(asset2.id, 'approved');

    // Make sure storage can resolve these paths in mock
    studio.storage.localPath = vi.fn().mockImplementation(async (key) => `/mock/path/to/${key}`);
    studio.storage.put = vi.fn().mockResolvedValue({
      key: 'projects/mock/exports/composer-video.mp4',
      sizeBytes: 999,
      checksum: 'fake-checksum',
      mimeType: 'video/mp4',
      url: '/mock-url',
    });

    const result = await composerService.composeVideo({
      projectId: project.id,
      resolution: '1920x1080',
      fps: 30,
    });

    expect(result.export).toBeDefined();
    expect(result.export.kind).toBe('video');
    expect(result.export.summary.shots).toBe(2);
    
    expect(result.asset).toBeDefined();
    expect(result.asset.kind).toBe('export');
    expect(result.asset.durationSeconds).toBe(10); // 5 + 5

    expect(studio.media.concatenateVideos).toHaveBeenCalledWith({
      videos: [
        { path: '/mock/path/to/mock1.mp4', mimeType: 'video/mp4' },
        { path: '/mock/path/to/mock2.mp4', mimeType: 'video/mp4' },
      ],
      audioTracks: [],
      fps: 30,
      resolution: '1920x1080',
    });
    
    // Check lineage
    const relations = await studio.assets.parents(result.asset.id);
    const parentIds = relations.map(r => r.parentId);
    expect(parentIds).toContain(asset1.id);
    expect(parentIds).toContain(asset2.id);
  });

  it('Compose the persisted episode audio mix', async () => {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const project = await studio.projects.create({
      workspaceId,
      ownerId,
      slug: `composer-audio-${randomUUID()}`,
      title: 'Composer Audio Test',
      description: '',
      genre: 'action',
      format: 'short-film',
      targetAudience: 'all',
      durationTargetSeconds: 60,
      aspectRatio: '16:9',
      stylePresetKey: undefined,
      costLimitUsd: 10,
      platform: 'youtube',
      language: 'vi-VN',
      secondaryAspectRatios: [],
      frameRate: 24,
      resolution: '1920x1080',
      creativeBrief: {},
    });
    const episode = await studio.episodes.upsertFirst(project.id, 'Episode 1');
    const scene = await studio.scenes.create(project.id, {
      code: 'EP01_SC01', number: 1, episodeId: episode.id, title: 'Scene', timeOfDay: 'day',
      summary: '', action: '', emotion: '', visualGoal: '', audioGoal: '', durationSeconds: 5,
      locationId: null, characters: [], status: 'approved', dialogue: [],
    });
    const shot = await studio.shots.create(project.id, {
      code: 'EP01_SC01_SH001', shotNumber: 1, episodeId: episode.id, sceneId: scene.id, title: 'Shot',
      description: '', shotSize: 'medium', cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'static' }, location: null, lens: '50mm', durationSeconds: 5,
      dialogue: '', emotion: '', lighting: '', characters: [], props: [], visualEffects: [], soundEffects: [],
      continuity: { incoming: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, outgoing: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, intentionalChanges: [] },
      aspectRatio: '16:9', importance: 'normal',
    });
    const video = await studio.assets.register({
      projectId: project.id, shotId: shot.id, generationId: null, kind: 'video', name: 'video',
      storageKey: 'video.mp4', mimeType: 'video/mp4', sizeBytes: 100, checksum: 'video', width: 1920,
      height: 1080, durationSeconds: 5, tags: [], metadata: {},
    });
    await studio.assets.setApproval(video.id, 'approved');
    const music = await studio.assets.register({
      projectId: project.id, shotId: null, generationId: null, kind: 'music', name: 'music',
      storageKey: 'music.mp3', mimeType: 'audio/mpeg', sizeBytes: 100, checksum: 'music', width: null,
      height: null, durationSeconds: 4, tags: [], metadata: {},
    });
    await studio.assets.setApproval(music.id, 'approved');
    await createSoundStudioService(studio).addTrackToMix(episode.id, {
      layer: 'music', assetId: music.id, shotId: null, generationId: null, startTimeSeconds: 1.5,
      durationSeconds: 3.5, gainDb: -5, muted: false,
    });
    studio.storage.localPath = vi.fn().mockImplementation(async (key) => `/mock/path/to/${key}`);
    studio.storage.put = vi.fn().mockResolvedValue({
      key: 'projects/mock/exports/audio.mp4', sizeBytes: 999, checksum: 'mixed', mimeType: 'video/mp4', url: '/mixed',
    });
    vi.mocked(studio.media.concatenateVideos).mockClear();

    const result = await composerService.composeVideo({
      projectId: project.id,
      episodeId: episode.id,
      resolution: '1920x1080',
      fps: 30,
    });

    expect(studio.media.concatenateVideos).toHaveBeenCalledWith({
      videos: [{ path: '/mock/path/to/video.mp4', mimeType: 'video/mp4' }],
      audioTracks: [{
        path: '/mock/path/to/music.mp3', mimeType: 'audio/mpeg', startTimeSeconds: 1.5,
        durationSeconds: 3.5, gainDb: -5,
      }],
      fps: 30,
      resolution: '1920x1080',
    });
    expect(result.export.summary.audioTracks).toBe(1);
    expect((await studio.assets.parents(result.asset.id)).map((relation) => relation.parentId)).toContain(music.id);
  });

  it('fails if any shot is missing an approved video asset', async () => {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const project = await studio.projects.create({
      workspaceId,
      ownerId,
      slug: `composer-fail-${randomUUID()}`,
      title: 'Composer Fail',
      description: 'Test project',
      genre: 'action',
      format: 'short-film',
      targetAudience: 'all',
      durationTargetSeconds: 60,
      aspectRatio: '16:9',
      stylePresetKey: undefined,
      costLimitUsd: 10,
      platform: 'youtube',
      language: 'vi-VN',
      secondaryAspectRatios: ['9:16'],
      frameRate: 24,
      resolution: '1920x1080',
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
      durationSeconds: 10,
      locationId: 'LOC1',
      characters: [],
      status: 'approved',
      dialogue: [],
    });

    await studio.shots.create(project.id, {
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
      durationSeconds: 5,
      dialogue: '',
      emotion: '',
      lighting: '',
      characters: [],
      props: [],
      visualEffects: [],
      soundEffects: [],
      continuity: { incoming: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, outgoing: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, intentionalChanges: [] },
      aspectRatio: '16:9',
      importance: 'normal',
    });

    // No asset created, this should fail
    await expect(
      composerService.composeVideo({
        projectId: project.id,
        resolution: '1920x1080',
        fps: 24,
      })
    ).rejects.toThrow(/Shot SH01 needs an approved video or version-bound storyboard image/);
  });

  it('Compose Hybrid video from approved imported images', async () => {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const project = await studio.projects.create({
      workspaceId, ownerId, slug: `composer-hybrid-image-${randomUUID()}`, title: 'Composer Hybrid Image',
      description: '', genre: 'motion-comic', format: 'short-film', targetAudience: 'all', durationTargetSeconds: 5,
      aspectRatio: '16:9', stylePresetKey: undefined, costLimitUsd: 0, platform: 'youtube', language: 'vi-VN',
      secondaryAspectRatios: [], frameRate: 24, resolution: '1920x1080', creativeBrief: {}, productionStrategy: 'hybrid',
    });
    const scene = await studio.scenes.create(project.id, {
      code: 'SC01', number: 1, episodeId: null, title: 'Scene', timeOfDay: 'day', summary: '', action: '',
      emotion: '', visualGoal: '', audioGoal: '', durationSeconds: 4, locationId: 'LOC1', characters: [],
      status: 'approved', dialogue: [],
    });
    const shot = await studio.shots.create(project.id, {
      code: 'SH01', shotNumber: 1, episodeId: null, sceneId: scene.id, title: 'Shot', description: '',
      shotSize: 'medium', cameraAngle: 'eye-level', cameraMovement: { type: 'static', speed: 'static' },
      location: null, lens: '50mm', durationSeconds: 4, dialogue: '', emotion: '', lighting: '', characters: [],
      props: [], visualEffects: [], soundEffects: [],
      continuity: { incoming: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, outgoing: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, intentionalChanges: [] },
      aspectRatio: '16:9', importance: 'normal',
    });
    const image = await studio.assets.register({
      projectId: project.id, shotId: null, generationId: null, kind: 'image', name: 'Imported keyframe',
      storageKey: 'storyboard.png', mimeType: 'image/png', sizeBytes: 100, checksum: randomUUID(), width: 1920,
      height: 1080, durationSeconds: null, tags: ['manual-import'], metadata: { originType: 'manual-import' },
    });
    await studio.assets.setApproval(image.id, 'approved');
    await studio.productionAssetBindings.bind({
      projectId: project.id, assetId: image.id, targetType: 'shot', targetId: shot.id,
      targetVersionId: '', role: 'storyboard-keyframe',
    });
    studio.storage.localPath = vi.fn().mockResolvedValue('/mock/path/to/storyboard.png');
    studio.storage.put = vi.fn().mockResolvedValue({
      key: 'projects/mock/exports/hybrid.mp4', sizeBytes: 999, checksum: randomUUID(), mimeType: 'video/mp4', url: '/hybrid.mp4',
    });
    vi.mocked(studio.media.concatenateVideos).mockClear();

    const result = await composerService.composeVideo({ projectId: project.id, resolution: '1920x1080', fps: 24 });

    expect(studio.media.concatenateVideos).toHaveBeenCalledWith({
      videos: [{
        path: '/mock/path/to/storyboard.png', mimeType: 'image/png', sourceKind: 'image',
        durationSeconds: 4, motion: 'subtle-zoom',
      }],
      audioTracks: [], fps: 24, resolution: '1920x1080',
    });
    expect(result.export.summary.productionStrategy).toBe('hybrid');
    expect((await studio.assets.parents(result.asset.id)).map((relation) => relation.parentId)).toContain(image.id);
  });

  it('Auto mode never falls back to manually imported images', async () => {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const project = await studio.projects.create({
      workspaceId, ownerId, slug: `composer-auto-manual-${randomUUID()}`, title: 'Composer Auto Guard',
      description: '', genre: 'motion-comic', format: 'short-film', targetAudience: 'all', durationTargetSeconds: 5,
      aspectRatio: '16:9', stylePresetKey: undefined, costLimitUsd: 0, platform: 'youtube', language: 'vi-VN',
      secondaryAspectRatios: [], frameRate: 24, resolution: '1920x1080', creativeBrief: {}, productionStrategy: 'auto',
    });
    const scene = await studio.scenes.create(project.id, {
      code: 'SC01', number: 1, episodeId: null, title: 'Scene', timeOfDay: 'day', summary: '', action: '',
      emotion: '', visualGoal: '', audioGoal: '', durationSeconds: 4, locationId: 'LOC1', characters: [], status: 'approved', dialogue: [],
    });
    const shot = await studio.shots.create(project.id, {
      code: 'SH01', shotNumber: 1, episodeId: null, sceneId: scene.id, title: 'Shot', description: '',
      shotSize: 'medium', cameraAngle: 'eye-level', cameraMovement: { type: 'static', speed: 'static' }, location: null,
      lens: '50mm', durationSeconds: 4, dialogue: '', emotion: '', lighting: '', characters: [], props: [], visualEffects: [], soundEffects: [],
      continuity: { incoming: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, outgoing: { note: '', characters: {}, environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] } }, intentionalChanges: [] },
      aspectRatio: '16:9', importance: 'normal',
    });
    const image = await studio.assets.register({
      projectId: project.id, shotId: shot.id, generationId: null, kind: 'image', name: 'Manual only', storageKey: 'manual.png',
      mimeType: 'image/png', sizeBytes: 100, checksum: randomUUID(), width: 1920, height: 1080, durationSeconds: null,
      tags: [], metadata: { originType: 'manual-import' },
    });
    await studio.assets.setApproval(image.id, 'approved');
    await studio.productionAssetBindings.bind({
      projectId: project.id, assetId: image.id, targetType: 'shot', targetId: shot.id,
      targetVersionId: '', role: 'storyboard-keyframe',
    });
    vi.mocked(studio.media.concatenateVideos).mockClear();

    await expect(
      composerService.composeVideo({ projectId: project.id, resolution: '1920x1080', fps: 24 }),
    ).rejects.toThrow(/approved provider-generated video/);
    expect(studio.media.concatenateVideos).not.toHaveBeenCalled();
  });
});
