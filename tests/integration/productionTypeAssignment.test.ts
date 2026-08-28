import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('productionTypeAssignment');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createProductionTypeAssignmentService } = await import('@/application/services/productionTypeAssignmentService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { getDb } = await import('@/infrastructure/db/client');
const { scenes, shots } = await import('@/infrastructure/db/schema');
const { newId } = await import('@/domain/ids');

const studio = getStudio();
const projectService = createProjectService(studio);
const assignmentService = createProductionTypeAssignmentService(studio);
const episodeService = createEpisodeService(studio);
const db = getDb();

let projNoEvidenceId = '';
let projEvidenceId = '';

beforeAll(async () => {
  await runMigrations();

  // Project 1: No evidence
  const p1 = await projectService.create({
    title: 'No Evidence Project',
    description: 'A project with no data yet.',
    genre: 'Drama',
    format: 'series',
    platform: 'youtube',
    aspectRatio: '16:9',
    durationTargetSeconds: 300,
    costLimitUsd: 100,
    stylePresetKey: 'cinematic',
    productionType: 'cinematic-short-film',
  });
  projNoEvidenceId = p1.id;

  // Project 2: With evidence
  const p2 = await projectService.create({
    title: 'Evidence Project',
    description: 'A project with data.',
    genre: 'Drama',
    format: 'series',
    platform: 'youtube',
    aspectRatio: '16:9',
    durationTargetSeconds: 300,
    costLimitUsd: 100,
    stylePresetKey: 'cinematic',
    productionType: 'animated-series',
  });
  projEvidenceId = p2.id;

  // Add evidence to p2
  const ep = await episodeService.createEpisode(projEvidenceId, { title: 'Pilot', synopsis: 'Pilot episode' });
  
  const sceneId = newId('scn');
  db.insert(scenes).values({
    id: sceneId,
    projectId: projEvidenceId,
    episodeId: ep.id,
    code: 'SC01',
    number: 1,
    title: 'Scene 1',
    locationId: null,
    timeOfDay: 'day',
    summary: 'The beginning',
    action: '',
    dialogueJson: '[]',
    emotion: '',
    visualGoal: '',
    audioGoal: '',
    durationSeconds: 10,
    charactersJson: '[]',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run();

  const shotId = newId('sht');
  db.insert(shots).values({
    id: shotId,
    projectId: projEvidenceId,
    episodeId: ep.id,
    sceneId: sceneId,
    code: 'SH01',
    shotNumber: 1,
    description: 'Close up',
    cameraAngle: '',
    cameraMovementJson: '[]',
    lens: '',
    lighting: '',
    visualEffectsJson: '[]',
    soundEffectsJson: '[]',
    continuityInJson: '{}',
    continuityOutJson: '{}',
    intentionalChangesJson: '[]',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run();

  // To simulate legacy null, we use the internal project service update which bypasses product-facing constraints
  await projectService.update(projNoEvidenceId, { productionType: null });
});

afterAll(async () => {
  env.cleanup();
});

describe('Real Persistence: Production Type Assignment', () => {
  it('1. legacy project with productionType = null can still be read', async () => {
    const p = await studio.projects.byId(projNoEvidenceId);
    expect(p).toBeDefined();
    expect(p?.productionType).toBeNull();
  });

  it('2. product-facing create persists explicit Production Type', async () => {
    const p = await studio.projects.byId(projEvidenceId);
    expect(p?.productionType).toBe('animated-series');
  });

  it('3. Project.format and Production Type may intentionally differ', async () => {
    const p = await studio.projects.byId(projEvidenceId);
    expect(p?.format).toBe('series');
    expect(p?.productionType).toBe('animated-series');
    expect(p?.format).not.toEqual(p?.productionType);
  });

  describe('4. project with no meaningful production evidence', () => {
    it('set works', async () => {
      const res = await assignmentService.change(projNoEvidenceId, { productionType: 'cinematic-short-film' });
      expect(res.status).toBe('UPDATED');
      const p = await studio.projects.byId(projNoEvidenceId);
      expect(p?.productionType).toBe('cinematic-short-film');
    });

    it('change works', async () => {
      const res = await assignmentService.change(projNoEvidenceId, { productionType: 'documentary' });
      expect(res.status).toBe('UPDATED');
      const p = await studio.projects.byId(projNoEvidenceId);
      expect(p?.productionType).toBe('documentary');
    });

    it('clear works', async () => {
      const res = await assignmentService.change(projNoEvidenceId, { productionType: null });
      expect(res.status).toBe('UPDATED');
      const p = await studio.projects.byId(projNoEvidenceId);
      expect(p?.productionType).toBeNull();
    });
  });

  describe('5 & 6 & 7. project with meaningful persisted production evidence', () => {
    it('unconfirmed change returns CONFIRMATION_REQUIRED, stored type remains', async () => {
      const res = await assignmentService.change(projEvidenceId, { productionType: 'documentary' });
      expect(res.status).toBe('CONFIRMATION_REQUIRED');
      expect(res.evidence).toContain('scenes');
      
      const p = await studio.projects.byId(projEvidenceId);
      expect(p?.productionType).toBe('animated-series'); // unchanged
    });

    it('confirmed change returns UPDATED, persists only new Production Type', async () => {
      const res = await assignmentService.change(projEvidenceId, { 
        productionType: 'documentary',
        confirmExistingProductionData: true
      });
      expect(res.status).toBe('UPDATED');
      
      const p = await studio.projects.byId(projEvidenceId);
      expect(p?.productionType).toBe('documentary');
      expect(p?.format).toBe('series'); // unaffected
    });

    it('confirmed clear persists null', async () => {
      const res = await assignmentService.change(projEvidenceId, { 
        productionType: null,
        confirmExistingProductionData: true
      });
      expect(res.status).toBe('UPDATED');
      
      const p = await studio.projects.byId(projEvidenceId);
      expect(p?.productionType).toBeNull();
    });
  });

  it('8. representative production records survive unchanged', async () => {
    const episodes = await studio.episodes.listByProject(projEvidenceId);
    expect(episodes.length).toBeGreaterThanOrEqual(1);

    const epId = episodes.find(e => e.title === 'Pilot')?.id || episodes[0]!.id;
    const scenes = await studio.scenes.listByEpisode(projEvidenceId, epId);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.title).toBe('Scene 1');

    const shots = await studio.shots.listByScene(scenes[0]!.id);
    expect(shots).toHaveLength(1);
    expect(shots[0]!.description).toBe('Close up');
  });
});
