import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';
import { continuitySchema, promptBlocksSchema } from '@/domain/schemas';

const env = useTempStudio('video-execution-confirmation-workflow-retry-regression');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createWorkflowService } = await import('@/application/services/workflowService');
const { createGenerationService } = await import('@/application/services/generationService');

runMigrations();
const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const workflow = createWorkflowService(studio);
const generations = createGenerationService(studio);

afterAll(() => env.cleanup());

async function createShotFixture(projectId: string) {
  const [episode] = await studio.episodes.listByProject(projectId);
  const scene = await studio.scenes.create(projectId, {
    code: 'SC01',
    number: 1,
    title: 'Scene One',
    episodeId: episode!.id,
    locationId: null,
    timeOfDay: 'day',
    summary: '',
    action: 'Test action',
    emotion: '',
    visualGoal: '',
    audioGoal: '',
    status: 'draft',
    characters: [],
    dialogue: [],
    durationSeconds: 10,
  });

  return studio.shots.create(projectId, {
    sceneId: scene.id,
    episodeId: episode!.id,
    code: 'SH001',
    shotNumber: 1,
    title: 'Shot',
    description: '',
    shotSize: 'wide',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'medium' },
    lens: '50mm',
    durationSeconds: 5,
    characters: [],
    location: null,
    props: [],
    dialogue: '',
    emotion: 'neutral',
    lighting: 'day',
    visualEffects: [],
    soundEffects: [],
    continuity: continuitySchema.parse({}),
    aspectRatio: '16:9',
    importance: 'normal',
  });
}

async function createVideoPromptFixture(projectId: string, shotId: string) {
  const compiled = 'A pinned video prompt with clean lint.';
  const { prompt } = await studio.prompts.createWithVersion({
    projectId,
    shotId,
    kind: 'video',
    name: 'Video prompt',
    blocks: promptBlocksSchema.parse({}),
    compiled,
    negative: '',
    lockRefs: { characters: [], style: null, location: null, props: [] },
    lint: {
      ok: true,
      score: 100,
      characterCount: compiled.length,
      issues: [],
    },
  });
  return prompt;
}

describe('safe video execution workflow regression', () => {
  it('pauses at the human keyframe approval gate so enqueue-video is skipped and no video Generation is created', async () => {
    const project = await projects.create({
      title: 'Workflow video confirmation boundary',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });

    await scripts.saveScript(project.slug, {
      title: 'Main',
      scriptType: 'motion-comic',
      raw: DEMO_SCRIPT,
    });

    const run = await workflow.run({
      projectId: project.id,
      workflowKey: 'stylized-3d',
      autoEnqueueGenerations: true,
    });

    const videoRows = (await studio.generations.listByProject(project.id)).filter(
      (row) => row.kind === 'video',
    );
    const humanApproval = run.steps.find((step) => step.key === 'human-approval-keyframes');
    const enqueueVideo = run.steps.find((step) => step.key === 'enqueue-video');

    expect(videoRows).toHaveLength(0);
    expect(humanApproval).toBeDefined();
    expect(humanApproval?.status).toBe('awaiting-approval');
    expect(enqueueVideo).toBeDefined();
    expect(enqueueVideo?.status).toBe('skipped');
    expect(enqueueVideo?.detail).toContain('waiting for the human gate above');
  });

  it('rejects the exact workflow video enqueue payload at the shared application boundary', async () => {
    const project = await projects.create({
      title: 'Workflow video enqueue payload boundary',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const shot = await createShotFixture(project.id);
    const prompt = await createVideoPromptFixture(project.id, shot.id);

    const videoRowsBefore = (await studio.generations.listByProject(project.id)).filter(
      (row) => row.kind === 'video',
    );
    const encumberedBefore = await studio.generations.encumberedUsd(project.id);
    const activityBefore = await studio.activity.recent(project.id, 100);

    await expect(
      generations.enqueue({
        projectId: project.id,
        shotId: shot.id,
        promptId: prompt.id,
        kind: 'video',
        params: {},
        referenceAssetIds: [],
        priority: 100,
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });

    const videoRowsAfter = (await studio.generations.listByProject(project.id)).filter(
      (row) => row.kind === 'video',
    );
    const activityAfter = await studio.activity.recent(project.id, 100);

    expect(videoRowsAfter).toEqual(videoRowsBefore);
    expect(videoRowsAfter).toHaveLength(0);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(encumberedBefore);
    expect(activityAfter).toEqual(activityBefore);
    expect(activityAfter.some((entry) => entry.action === 'generation.enqueued')).toBe(false);
  });
});