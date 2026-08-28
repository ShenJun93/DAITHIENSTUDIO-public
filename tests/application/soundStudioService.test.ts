import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('sound');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createSoundStudioService } = await import('@/application/services/soundStudioService');
const { createProjectService } = await import('@/application/services/projectService');

const studio = getStudio();
const service = createSoundStudioService(studio);
const projects = createProjectService(studio);

describe('Sound Studio Domain & Persistence (TASK-017A)', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('creates an empty mix for a new episode', async () => {
    const project = await projects.create({
      title: 'Sound Test',
    });
    const eps = await studio.episodes.listByProject(project.id);
    const ep = eps[0]!;

    const mix = await service.getMixForEpisode(ep.id);
    expect(mix.episodeId).toBe(ep.id);
    expect(mix.tracks).toHaveLength(0);
  });

  it('rejects a mix id that does not belong to the episode', async () => {
    const project = await projects.create({ title: 'Mix Ownership' });
    const episode = (await studio.episodes.listByProject(project.id))[0]!;
    const mix = await service.getMixForEpisode(episode.id);

    await expect(service.saveMix({ ...mix, id: 'mix_tampered' })).rejects.toThrow(
      'does not match the persisted episode mix',
    );
  });

  it('rejects tracks with unapproved assets', async () => {
    const project = await projects.create({
      title: 'Sound Test 2',
    });
    const eps = await studio.episodes.listByProject(project.id);
    const ep = eps[0]!;

    const asset = await studio.assets.register({
      projectId: project.id,
      shotId: null,
      generationId: null,
      kind: 'sound',
      name: 'unapproved.mp3',
      durationSeconds: 10,
      storageKey: 'unapproved.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      checksum: 'abc',
      width: null,
      height: null,
      tags: [],
      metadata: {},
    }); // defaults to pending

    await expect(
      service.addTrackToMix(ep.id, {
        layer: 'dialogue',
        assetId: asset.id,
        shotId: null,
        generationId: null,
        startTimeSeconds: 0,
        durationSeconds: 10,
        gainDb: 0,
        muted: false,
      })
    ).rejects.toThrow('Cannot use unapproved asset');
  });

  it('adds and persists tracks correctly', async () => {
    const project = await projects.create({
      title: 'Sound Test 3',
    });
    const eps = await studio.episodes.listByProject(project.id);
    const ep = eps[0]!;

    let asset = await studio.assets.register({
      projectId: project.id,
      shotId: null,
      generationId: null,
      kind: 'sound',
      name: 'approved.mp3',
      durationSeconds: 10,
      storageKey: 'approved.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      checksum: 'def',
      width: null,
      height: null,
      tags: [],
      metadata: {},
    });
    asset = await studio.assets.setApproval(asset.id, 'approved');

    await service.addTrackToMix(ep.id, {
      layer: 'dialogue',
      assetId: asset.id,
      shotId: null,
      generationId: null,
      startTimeSeconds: 0,
      durationSeconds: 10,
      gainDb: 0,
      muted: false,
    });

    // Fetch it fresh
    const freshMix = await service.getMixForEpisode(ep.id);
    expect(freshMix.tracks).toHaveLength(1);
    expect(freshMix.tracks[0]!.layer).toBe('dialogue');
    expect(freshMix.tracks[0]!.durationSeconds).toBe(10);
    expect(freshMix.tracks[0]!.assetId).toBe(asset.id);
  });

  it('rejects approved audio owned by another project', async () => {
    const ownerProject = await projects.create({ title: 'Audio Owner' });
    const targetProject = await projects.create({ title: 'Mix Target' });
    const targetEpisode = (await studio.episodes.listByProject(targetProject.id))[0]!;
    let asset = await studio.assets.register({
      projectId: ownerProject.id,
      shotId: null,
      generationId: null,
      kind: 'music',
      name: 'foreign.mp3',
      durationSeconds: 2,
      storageKey: 'foreign.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 10,
      checksum: 'foreign',
      width: null,
      height: null,
      tags: [],
      metadata: {},
    });
    asset = await studio.assets.setApproval(asset.id, 'approved');

    await expect(service.addTrackToMix(targetEpisode.id, {
      layer: 'music',
      assetId: asset.id,
      shotId: null,
      generationId: null,
      startTimeSeconds: 0,
      durationSeconds: 2,
      gainDb: 0,
      muted: false,
    })).rejects.toThrow('belongs to another project');
  });

  it('imports an asset to mix, correctly calculating offset and replacing source', async () => {
    const project = await projects.create({ title: 'Sound Test 4' });
    const eps = await studio.episodes.listByProject(project.id);
    const ep = eps[0]!;

    const scene = await studio.scenes.create(project.id, {
      code: 'SCN-1',
      number: 1,
      title: 'Scene 1',
      episodeId: ep.id,
      locationId: null,
      timeOfDay: 'day',
      summary: '',
      action: 'Test',
      emotion: '',
      visualGoal: '',
      audioGoal: '',
      status: 'draft',
      characters: [],
      dialogue: [],
      durationSeconds: 10,
    });

    const shot = await studio.shots.create(project.id, {
      sceneId: scene.id,
      code: 'SH-1',
      shotNumber: 1,
      episodeId: ep.id,
      title: 'Shot 1',
      description: 'Test',
      shotSize: 'wide',
      cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'medium' },
      lens: '50mm',
      durationSeconds: 5,
      dialogue: 'Hello',
      characters: [],
      location: null,
      props: [],
      emotion: 'neutral',
      lighting: 'day',
      visualEffects: [],
      soundEffects: [],
      continuity: {
        incoming: {
          characters: {},
          environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] },
          note: ''
        },
        outgoing: {
          characters: {},
          environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] },
          note: ''
        },
        intentionalChanges: []
      },
      aspectRatio: '16:9',
      importance: 'normal',
    });

    let voiceAsset = await studio.assets.register({
      projectId: project.id,
      shotId: shot.id,
      generationId: null,
      kind: 'voice',
      name: 'voice.mp3',
      durationSeconds: 3,
      storageKey: 'voice.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      checksum: 'hash',
      width: null,
      height: null,
      tags: [],
      metadata: {},
    });
    voiceAsset = await studio.assets.setApproval(voiceAsset.id, 'approved');

    // Import it!
    let mix = await service.importAssetToMix(ep.id, voiceAsset.id);
    expect(mix.tracks).toHaveLength(1);
    expect(mix.tracks[0]!.layer).toBe('dialogue');
    expect(mix.tracks[0]!.shotId).toBe(shot.id);
    expect(mix.tracks[0]!.startTimeSeconds).toBe(0);
    expect(mix.tracks[0]!.assetId).toBe(voiceAsset.id);

    // Approve a new one for the SAME shot
    let newVoiceAsset = await studio.assets.register({
      projectId: project.id,
      shotId: shot.id,
      generationId: null,
      kind: 'voice',
      name: 'voice2.mp3',
      durationSeconds: 2,
      storageKey: 'voice2.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      checksum: 'hash2',
      width: null,
      height: null,
      tags: [],
      metadata: {},
    });
    newVoiceAsset = await studio.assets.setApproval(newVoiceAsset.id, 'approved');

    mix = await service.importAssetToMix(ep.id, newVoiceAsset.id);

    // It should have replaced the source!
    expect(mix.tracks).toHaveLength(1);
    expect(mix.tracks[0]!.layer).toBe('dialogue');
    expect(mix.tracks[0]!.shotId).toBe(shot.id);
    expect(mix.tracks[0]!.assetId).toBe(newVoiceAsset.id);
  });
});
