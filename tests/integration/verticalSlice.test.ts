/**
 * End-to-end vertical slice, against a real SQLite file and the real mock
 * provider: Project → Script → Scene → Shot → Prompt → Generation → Asset →
 * Approval → Timeline → Export.
 *
 * If this test passes, the product works. It is the one test that must never
 * be skipped.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('slice');

// Imported after the environment is pointed at the temp database.
const { getStudio, } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createPromptService } = await import('@/application/services/promptService');
const { createGenerationService } = await import('@/application/services/generationService');
const { createAssetService } = await import('@/application/services/assetService');
const { createQualityService } = await import('@/application/services/qualityService');
const { createTimelineService } = await import('@/application/services/timelineService');
const { createExportService } = await import('@/application/services/exportService');
const { createContinuityService } = await import('@/application/services/continuityService');
const { createVisualControlService } = await import('@/application/services/visualControlService');
const { createVisualPackageApprovalService } = await import('@/application/services/visualPackageApprovalService');
const { createWorker } = await import('@/infrastructure/queue/worker');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const prompts = createPromptService(studio);
const generations = createGenerationService(studio);
const assets = createAssetService(studio);
const visualControl = createVisualControlService(studio);
const visualPackageApprovals = createVisualPackageApprovalService(studio);

async function confirmImageGeneration(request: Record<string, unknown>) {
  const prepared = await generations.prepareImage(request);
  return generations.confirmImage({
    request,
    confirmationToken: prepared.confirmationToken,
  });
}

let projectId = '';
let projectSlug = '';

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('vertical slice', () => {
  it('Create a project and keep it after a reload', async () => {
    const project = await projects.create({
      title: 'Triệu Ngốc — Kiểm Thử',
      description: 'integration fixture',
      aspectRatio: '16:9',
      durationTargetSeconds: 120,
      stylePresetKey: 'stylized-3d-cinematic-comedy',
      productionType: 'motion-comic',
    });
    projectId = project.id;
    projectSlug = project.slug;

    // "Reload" = a fresh read straight from the database.
    const reloaded = await projects.get(project.slug);
    expect(reloaded.id).toBe(project.id);
    expect(reloaded.title).toBe('Triệu Ngốc — Kiểm Thử');
    expect(reloaded.styleId).toBeTruthy();
  });

  it('Reject a project with an empty title', async () => {
    await expect(projects.create({ title: '   ' })).rejects.toThrow();
  });

  it('Parse a saved script into at least three scenes', async () => {
    await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    const result = await scripts.parseIntoScenes(projectSlug);

    expect(result.scenes.length).toBeGreaterThanOrEqual(3);
    expect(result.createdCharacters.length).toBeGreaterThanOrEqual(2);
    expect(result.createdLocations.length).toBeGreaterThanOrEqual(2);
  });

  it('Refuse to re-parse over existing scenes without explicit confirmation', async () => {
    await expect(scripts.parseIntoScenes(projectSlug)).rejects.toMatchObject({ code: 'CONFLICT' });
    const scenes = await studio.scenes.listByProject(projectId);
    expect(scenes.length).toBeGreaterThanOrEqual(3);
  });

  it('Build a shot list where every shot pins a bible snapshot', async () => {
    const result = await scripts.buildShots(projectSlug);
    expect(result.shots.length).toBeGreaterThanOrEqual(10);

    const shots = await studio.shots.listByProject(projectId);
    for (const shot of shots) {
      expect(shot.code).toMatch(/^EP\d{2}_SC\d{2}_SH\d{3}$/);
      for (const ref of shot.characters) {
        expect(ref.versionId).toMatch(/^CHAR\d{3}_V\d+$/);
      }
    }
  });

  it('Compile a prompt that carries Character, Style and Location locks', async () => {
    const shots = await studio.shots.listByProject(projectId);
    const withCast = shots.find((shot) => shot.characters.length > 0);
    expect(withCast).toBeDefined();

    const built = await prompts.buildForShot(withCast!.id, 'image');
    expect(built.version.version).toBe(1);
    expect(built.version.lockRefs.characters.length).toBeGreaterThan(0);
    expect(built.version.lockRefs.style).not.toBeNull();
    expect(built.version.lockRefs.location).not.toBeNull();
    expect(built.version.compiled).toContain('Character identity:');
    expect(built.lint.ok).toBe(true);
  });

  it('Editing a character creates a new version without changing existing prompts', async () => {
    const shots = await studio.shots.listByProject(projectId);
    const shot = shots.find((candidate) => candidate.characters.length > 0)!;
    const before = await prompts.latestForShot(shot.id, 'image');
    const pinned = before!.version.lockRefs.characters[0]!;

    const character = await studio.bibles.characterById(pinned.id);
    const updated = await studio.bibles.updateCharacter(pinned.id, {
      variable: { ...character!.variable, costume: 'a completely different robe' },
    });
    expect(updated.currentVersion).toBe(pinned.version + 1);

    const after = await prompts.latestForShot(shot.id, 'image');
    expect(after!.version.compiled).toBe(before!.version.compiled);

    const snapshot = await studio.bibles.version('character', pinned.id, pinned.version);
    expect(snapshot).not.toBeNull();
  });

  it('Recompiling a prompt adds a version instead of overwriting one', async () => {
    const shots = await studio.shots.listByProject(projectId);
    const shot = shots.find((candidate) => candidate.characters.length > 0)!;
    const built = await prompts.buildForShot(shot.id, 'image');
    expect(built.version.version).toBe(2);

    const versions = await prompts.versionsOf(built.prompt.id);
    expect(versions).toHaveLength(2);

    // The shot is still pinned to the OLD character snapshot, so recompiling
    // reproduces the same text. A bible edit must not leak into a shot that was
    // never re-pinned — that is the whole point of pinning.
    expect(versions[1]?.compiled).toBe(versions[0]?.compiled);
    expect(versions[1]?.lockRefs.characters[0]?.version).toBe(versions[0]?.lockRefs.characters[0]?.version);
  });

  it('Re-pinning a shot to a newer bible version changes the compiled prompt', async () => {
    const shots = await studio.shots.listByProject(projectId);
    const shot = shots.find((candidate) => candidate.characters.length > 0)!;
    const before = await prompts.latestForShot(shot.id, 'image');
    const ref = shot.characters[0]!;

    const character = await studio.bibles.characterById(ref.characterId);
    const newVersionId = `${character!.code}_V${character!.currentVersion}`;
    expect(newVersionId).not.toBe(ref.versionId);

    // Re-pin EVERY shot that uses this character. Re-pinning only one would
    // create version drift across the episode — which the continuity checker
    // correctly reports as a blocking error.
    for (const candidate of shots) {
      if (!candidate.characters.some((entry) => entry.characterId === ref.characterId)) continue;
      await studio.shots.update(candidate.id, {
        characters: candidate.characters.map((entry) =>
          entry.characterId === ref.characterId ? { ...entry, versionId: newVersionId } : entry,
        ),
      });
    }

    const after = await prompts.buildForShot(shot.id, 'image');
    expect(after.version.compiled).not.toBe(before!.version.compiled);
    expect(after.version.compiled).toContain('a completely different robe');
    expect(after.version.lockRefs.characters[0]?.version).toBe(character!.currentVersion);
  });

  it('Queue a generation and track it through to completion', async () => {
    const shots = await studio.shots.listByProject(projectId);
    const shot = shots.find((candidate) => candidate.characters.length > 0)!;
    const prompt = await studio.prompts.findForShot(shot.id, 'image');

    const enqueued = await confirmImageGeneration({
      projectId,
      shotId: shot.id,
      promptId: prompt!.id,
      kind: 'image',
      provider: 'mock',
      params: { count: 1 },
      referenceAssetIds: [],
      priority: 10,
    });
    expect(enqueued.generation.status).toBe('pending');
    expect(enqueued.reused).toBe(false);

    const processed = await createWorker(studio, { workerId: 'test' }).drain();
    expect(processed).toBeGreaterThanOrEqual(1);

    const after = await studio.generations.byId(enqueued.generation.id);
    expect(after?.status).toBe('completed');
    expect(after?.provider).toBe('mock');
    expect(after?.actualCostUsd).toBe(0);

    const produced = await studio.assets.listByGeneration(enqueued.generation.id);
    expect(produced.length).toBeGreaterThan(0);
    expect(produced[0]?.sizeBytes).toBeGreaterThan(0);
    expect(produced[0]?.checksum).toHaveLength(64);
  });

  it('Retrying an identical generation reuses the job instead of duplicating it', async () => {
    const shots = await studio.shots.listByProject(projectId);
    const shot = shots.find((candidate) => candidate.characters.length > 0)!;
    const prompt = await studio.prompts.findForShot(shot.id, 'image');

    const again = await confirmImageGeneration({
      projectId,
      shotId: shot.id,
      promptId: prompt!.id,
      kind: 'image',
      provider: 'mock',
      params: { count: 1 },
      referenceAssetIds: [],
      priority: 10,
    });
    expect(again.reused).toBe(true);
  });

  it('Approve an asset and refuse to change it afterwards', async () => {
    const list = await studio.assets.list(projectId, { limit: 10 });
    const asset = list[0]!;

    await createQualityService(studio).checkAsset(asset.id);
    const approved = await assets.decide(asset.id, 'approved', 'looks right', null);
    expect(approved.approvalState).toBe('approved');

    await expect(assets.decide(asset.id, 'rejected', 'changed my mind', null)).rejects.toMatchObject({
      code: 'IMMUTABLE_APPROVED_ASSET',
    });
    await expect(assets.softDelete(asset.id)).rejects.toMatchObject({ code: 'IMMUTABLE_APPROVED_ASSET' });
  });

  it('offline mock must be able to drive the whole flow', async () => {
    const list = await studio.assets.list(projectId, { approvalState: 'approved', limit: 10 });
    const anchorAsset = list.find((asset) => asset.shotId !== null)!;
    expect(anchorAsset).toBeDefined();
    expect(anchorAsset.shotId).not.toBeNull();

    const initial = await visualControl.overview(projectId, anchorAsset.shotId!);
    expect(initial.pinnedReferences.length).toBeGreaterThan(0);

    const roleByKind = {
      character: 'identity-anchor',
      location: 'environment-anchor',
      prop: 'prop-anchor',
      style: 'style-anchor',
    } as const;

    for (const pin of initial.pinnedReferences) {
      expect(pin.versionId).not.toBeNull();
      await studio.productionAssetBindings.bind({
        projectId,
        assetId: anchorAsset.id,
        targetType: pin.kind,
        targetId: pin.refId,
        targetVersionId: pin.versionId!,
        role: roleByKind[pin.kind],
      });
    }

    const current = await visualControl.overview(projectId, anchorAsset.shotId!);
    const beforeDecision = await visualPackageApprovals.reviewForShot(projectId, anchorAsset.shotId!);
    expect(beforeDecision.eligibility).toEqual({ eligible: true, reasons: [] });

    const decided = await visualPackageApprovals.decideCurrentPackage(
      projectId,
      anchorAsset.shotId!,
      current.packageFingerprint,
      'approved',
      'VC9 offline mock E2E evidence',
      'vc9-e2e-test',
    );
    expect(decided.packageFingerprint).toBe(current.packageFingerprint);
    expect(decided.approval.decision).toBe('approved');

    const afterDecision = await visualPackageApprovals.reviewForShot(projectId, anchorAsset.shotId!);
    expect(afterDecision.currentApproved).toBe(true);
    expect(afterDecision.invalidated).toBe(false);
    expect(afterDecision.latestApproved?.packageFingerprint).toBe(current.packageFingerprint);
  });

  it('Trace an asset back to its prompt version and bible snapshots', async () => {
    const list = await studio.assets.list(projectId, { limit: 10 });
    const lineage = await assets.lineage(list[0]!.id);

    expect(lineage.generation).not.toBeNull();
    expect(lineage.promptVersion).not.toBeNull();
    expect(lineage.shotCode).toMatch(/^EP\d{2}_SC\d{2}_SH\d{3}$/);
    expect(lineage.bibleVersions.some((entry) => entry.kind === 'character')).toBe(true);

    const trail = await assets.lineageTrail(list[0]!.id);
    expect(trail.join('\n')).toContain('prompt v');
  });

  it('Record a quality report with automatic and manual checks', async () => {
    const list = await studio.assets.list(projectId, { limit: 10 });
    const report = await createQualityService(studio).checkAsset(list[0]!.id);

    expect(report.checks.length).toBeGreaterThan(5);
    expect(report.checks.some((check) => check.status === 'manual')).toBe(true);
    expect(report.checks.some((check) => check.id === 'character-lock' && check.status === 'pass')).toBe(true);
  });

  it('Report continuity findings that name a field a human can fix', async () => {
    const report = await createContinuityService(studio).forProject(projectSlug);
    expect(Array.isArray(report.findings)).toBe(true);
    for (const finding of report.findings) {
      expect(finding.message.length).toBeGreaterThan(10);
      expect(['intentional-change', 'missing-transition', 'continuity-violation', 'unknown']).toContain(
        finding.classification,
      );
    }
  });

  it('Assemble a timeline that shows which shots are missing media', async () => {
    const timeline = await createTimelineService(studio).build(projectSlug);
    expect(timeline.items.length).toBeGreaterThanOrEqual(10);
    expect(timeline.totalSeconds).toBeGreaterThan(0);
    expect(timeline.items.some((item) => item.missing.includes('video'))).toBe(true);
  });

  it('Export a project package that freezes the versions it used', async () => {
    const result = await createExportService(studio).run({ projectId, kind: 'project-package' });
    expect(result.export.kind).toBe('project-package');

    const { body } = await createExportService(studio).read(result.export.id);
    const pack = JSON.parse(body) as {
      formatVersion: string;
      shots: unknown[];
      frozenVersions: { characters: string[]; styles: string[] };
      lineage: Record<string, string[]>;
      costs: { actualUsd: number };
    };

    expect(pack.formatVersion).toBe('1.0');
    expect(pack.shots.length).toBeGreaterThanOrEqual(10);
    expect(pack.frozenVersions.characters.length).toBeGreaterThan(0);
    expect(Object.keys(pack.lineage).length).toBeGreaterThan(0);
    expect(pack.costs.actualUsd).toBe(0);
  });

  it('Export a shot list as CSV', async () => {
    const result = await createExportService(studio).run({ projectId, kind: 'shot-list' });
    const { body } = await createExportService(studio).read(result.export.id);
    expect(body.split('\n')[0]).toContain('code,scene,shotSize');
    expect(body.split('\n').length).toBeGreaterThanOrEqual(11);
  });
});