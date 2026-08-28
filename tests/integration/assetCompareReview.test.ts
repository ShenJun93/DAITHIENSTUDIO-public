import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('asset-compare-review');
const { getStudio } = await import('@/infrastructure/container');
const { getDb } = await import('@/infrastructure/db/client');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createPromptService } = await import('@/application/services/promptService');
const { createGenerationService } = await import('@/application/services/generationService');
const { createAssetService } = await import('@/application/services/assetService');
const { createQualityService } = await import('@/application/services/qualityService');
const { createWorker } = await import('@/infrastructure/queue/worker');

const studio = getStudio();
const assetService = createAssetService(studio);
const qualityService = createQualityService(studio);
let projectId = '';
let shotId = '';
let promptId = '';
let candidateIds: string[] = [];

beforeAll(async () => {
  runMigrations();
  const project = await createProjectService(studio).create({
    title: 'Asset Compare Review',
    productionType: 'motion-comic',
  });
  projectId = project.id;
  const scripts = createScriptService(studio);
  await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(project.slug);
  const built = await scripts.buildShots(project.slug);
  const shot = built.shots.find((entry) => entry.characters.length > 0)!;
  shotId = shot.id;
  const prompt = await createPromptService(studio).buildForShot(shot.id, 'image');
  promptId = prompt.prompt.id;

  const generations = createGenerationService(studio);
  for (const seed of [101, 202, 303]) {
    const request = {
      projectId,
      shotId,
      promptId,
      kind: 'image' as const,
      provider: 'mock',
      params: { count: 1, seed },
      referenceAssetIds: [],
      priority: 10,
    };
    const prepared = await generations.prepareImage(request);
    await generations.confirmImage({
      request,
      confirmationToken: prepared.confirmationToken,
    });
  }
  await createWorker(studio, { workerId: 'asset-compare-review-test' }).drain();
  const completedGenerations = await studio.generations.listByShot(shotId);
  for (const [index, generation] of completedGenerations.slice(1).entries()) {
    await studio.assets.register({
      projectId,
      shotId,
      generationId: generation.id,
      kind: 'image',
      name: `Candidate ${index + 2}`,
      storageKey: `tests/candidate-${index + 2}.png`,
      mimeType: 'image/png',
      sizeBytes: 1024 + index,
      checksum: `${index + 2}`.repeat(64),
      width: 1920,
      height: 1080,
      durationSeconds: null,
      tags: ['test-candidate'],
      metadata: { source: 'integration-fixture' },
    });
  }
  candidateIds = (await studio.assets.list(projectId, { shotId, limit: 10 })).map((asset) => asset.id);
  expect(candidateIds).toHaveLength(3);
});

afterAll(() => env.cleanup());

describe('asset compare review', () => {
  it('Rejects cross-project shot associations before upload or decision can mutate either project', async () => {
    const otherProject = await createProjectService(studio).create({ title: 'Asset Compare Other Project' });
    const otherScripts = createScriptService(studio);
    await otherScripts.saveScript(otherProject.slug, { title: 'Other', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await otherScripts.parseIntoScenes(otherProject.slug);
    const otherBuilt = await otherScripts.buildShots(otherProject.slug);
    const otherShot = otherBuilt.shots[0]!;
    const otherShotBefore = await studio.shots.byId(otherShot.id);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('cross-project-upload'),
    ]);

    await expect(
      assetService.upload(
        projectId,
        { kind: 'image', name: 'Wrong project shot', shotId: otherShot.id },
        { fileName: 'wrong-project.png', mimeType: 'image/png', data: png },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const forged = await studio.assets.register({
      projectId,
      shotId: otherShot.id,
      generationId: null,
      kind: 'image',
      name: 'Forged cross-project asset',
      storageKey: 'tests/forged-cross-project.png',
      mimeType: 'image/png',
      sizeBytes: png.length,
      checksum: '8'.repeat(64),
      width: 1,
      height: 1,
      durationSeconds: null,
      tags: ['cross-project-test'],
      metadata: {},
    });
    const approvalsBefore = await studio.approvals.listForTarget(projectId, 'asset', forged.id);
    const activitiesBefore = await studio.activity.recent(projectId, 100);

    await expect(assetService.decide(forged.id, 'rejected', 'must stay isolated', null)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    expect((await studio.assets.byId(forged.id))?.approvalState).toBe('pending');
    expect(await studio.approvals.listForTarget(projectId, 'asset', forged.id)).toHaveLength(approvalsBefore.length);
    expect((await studio.activity.recent(projectId, 100)).length).toBe(activitiesBefore.length);
    expect(await studio.shots.byId(otherShot.id)).toEqual(otherShotBefore);
  });

  it('Compare two generated candidates with exact provenance and review metadata', async () => {
    const assets = await studio.assets.list(projectId, { shotId, limit: 10 });
    const candidates = await Promise.all(assets.slice(0, 2).map(async (asset) => {
      const generation = await studio.generations.byId(asset.generationId!);
      const prompt = await studio.prompts.version(generation!.promptId!, generation!.promptVersion!);
      return { asset, generation, prompt, quality: await studio.quality.latestForAsset(asset.id) };
    }));
    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.generation).toMatchObject({ provider: 'mock', model: expect.any(String), actualCostUsd: expect.any(Number) });
      expect(candidate.prompt).toMatchObject({ promptId, version: candidate.generation!.promptVersion });
      expect(candidate.quality).toBeNull();
    }
  });

  it('Approve an exact asset only after its QC and generation-pinned prompt lint are clean', async () => {
    const assetId = candidateIds[0]!;
    await expect(assetService.decide(assetId, 'approved', 'before QC', null)).rejects.toMatchObject({ code: 'CONFLICT' });

    const generation = await studio.generations.byId((await studio.assets.byId(assetId))!.generationId!);
    const pinnedVersion = await studio.prompts.version(promptId, generation!.promptVersion!);
    await studio.prompts.addVersion(promptId, {
      blocks: pinnedVersion!.blocks,
      compiled: pinnedVersion!.compiled,
      negative: pinnedVersion!.negative,
      lockRefs: { characters: [], location: null, props: [], style: null },
      lint: pinnedVersion!.lint!,
    });

    const report = await qualityService.checkAsset(assetId);
    expect(report.assetId).toBe(assetId);
    expect(report.checks.find((check) => check.id === 'character-lock')?.status).toBe('pass');
    const approved = await assetService.decide(assetId, 'approved', 'exact evidence is clean', null);
    expect(approved.approvalState).toBe('approved');

    const eventsBefore = await studio.approvals.listForTarget(projectId, 'asset', assetId);
    await assetService.decide(assetId, 'approved', 'retry', null);
    const eventsAfter = await studio.approvals.listForTarget(projectId, 'asset', assetId);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });

  it('Rejecting a losing candidate preserves an approved shot', async () => {
    const rejected = await assetService.decide(candidateIds[1]!, 'rejected', 'losing candidate', null);
    expect(rejected.approvalState).toBe('rejected');
    expect((await studio.shots.byId(shotId))?.status).toBe('approved');
  });

  it('A generation-pinned blocking prompt rejects approval even when the latest prompt is clean', async () => {
    const latest = await studio.prompts.latestVersion(promptId);
    const blockingVersion = await studio.prompts.addVersion(promptId, {
      blocks: latest!.blocks,
      compiled: latest!.compiled,
      negative: latest!.negative,
      lockRefs: latest!.lockRefs,
      lint: {
        ok: false,
        score: 80,
        characterCount: latest!.compiled.length,
        issues: [{ rule: 'pinned-blocker', severity: 'error', message: 'Pinned prompt is blocked.', hint: 'Create a new generation.' }],
      },
    });
    const enqueued = await studio.generations.enqueue({
      projectId,
      shotId,
      promptId,
      promptVersion: blockingVersion.version,
      kind: 'image',
      provider: 'mock',
      model: 'mock-image-v1',
      prompt: blockingVersion.compiled,
      negativePrompt: blockingVersion.negative,
      params: { count: 1 },
      referenceAssetIds: [],
      seed: 404,
      status: 'pending',
      priority: 10,
      maxAttempts: 3,
      scheduledAt: studio.clock.nowIso(),
      estimatedCostUsd: 0,
      idempotencyKey: 'pinned-blocking-approval-test',
    }, studio.config.costLimitUsdPerProject);
    expect(enqueued.promptVersion).toBe(blockingVersion.version);
    const cleanLatest = await studio.prompts.addVersion(promptId, {
      blocks: latest!.blocks,
      compiled: latest!.compiled,
      negative: latest!.negative,
      lockRefs: latest!.lockRefs,
      lint: { ok: true, score: 100, characterCount: latest!.compiled.length, issues: [] },
    });
    expect(cleanLatest.version).toBeGreaterThan(blockingVersion.version);
    const asset = await studio.assets.register({
      projectId,
      shotId,
      generationId: enqueued.id,
      kind: 'image',
      name: 'Pinned blocking candidate',
      storageKey: 'tests/pinned-blocking.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      checksum: '9'.repeat(64),
      width: 1920,
      height: 1080,
      durationSeconds: null,
      tags: ['pinned-lint-test'],
      metadata: {},
    });
    await qualityService.checkAsset(asset.id);

    await expect(assetService.decide(asset.id, 'approved', 'latest is clean', null)).rejects.toMatchObject({
      code: 'PROMPT_LINT_BLOCKED',
      details: { promptId, version: blockingVersion.version },
    });
    expect((await studio.assets.byId(asset.id))?.approvalState).toBe('pending');
  });

  it('Changes requested records one event and activity while a pending asset remains pending', async () => {
    const assetId = candidateIds[2]!;
    const before = await studio.assets.byId(assetId);
    const updated = await assetService.decide(assetId, 'changes-requested', 'adjust framing', null);
    const events = await studio.approvals.listForTarget(projectId, 'asset', assetId);
    const activities = await studio.activity.recent(projectId, 100);

    expect(updated.approvalState).toBe('pending');
    expect(updated.updatedAt).toBe(before!.updatedAt);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ decision: 'changes-requested', note: 'adjust framing' });
    expect(activities.filter((entry) => entry.targetId === assetId && entry.action === 'asset.changes-requested')).toHaveLength(1);
    expect((await studio.shots.byId(shotId))?.status).toBe('approved');
  });

  it('Asset decision state and event roll back together when the event cannot be recorded', async () => {
    const assetId = candidateIds[2]!;
    const eventsBefore = await studio.approvals.listForTarget(projectId, 'asset', assetId);
    getDb().$client.exec(`CREATE TRIGGER fail_asset_decision BEFORE INSERT ON approvals
      WHEN NEW.note = 'ROLLBACK_TEST' BEGIN SELECT RAISE(ABORT, 'forced approval failure'); END;`);
    try {
      await expect(assetService.decide(assetId, 'rejected', 'ROLLBACK_TEST', null)).rejects.toThrow('forced approval failure');
    } finally {
      getDb().$client.exec('DROP TRIGGER fail_asset_decision');
    }
    expect((await studio.assets.byId(assetId))?.approvalState).toBe('pending');
    expect(await studio.approvals.listForTarget(projectId, 'asset', assetId)).toHaveLength(eventsBefore.length);
    expect((await studio.shots.byId(shotId))?.status).toBe('approved');
  });

  it('Asset state and approval event roll back when decision activity cannot be recorded', async () => {
    const assetId = candidateIds[2]!;
    const eventsBefore = await studio.approvals.listForTarget(projectId, 'asset', assetId);
    getDb().$client.exec(`CREATE TRIGGER fail_asset_activity BEFORE INSERT ON activity_logs
      WHEN NEW.action = 'asset.rejected' BEGIN SELECT RAISE(ABORT, 'forced activity failure'); END;`);
    try {
      await expect(assetService.decide(assetId, 'rejected', 'activity rollback', null)).rejects.toThrow('forced activity failure');
    } finally {
      getDb().$client.exec('DROP TRIGGER fail_asset_activity');
    }
    expect((await studio.assets.byId(assetId))?.approvalState).toBe('pending');
    expect(await studio.approvals.listForTarget(projectId, 'asset', assetId)).toHaveLength(eventsBefore.length);
    expect((await studio.shots.byId(shotId))?.status).toBe('approved');
  });
});
