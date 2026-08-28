/**
 * TASK-UI-VISUAL-CONTROL-001 — VC3: `scriptService.repinShot`, the one narrow
 * application repin boundary. Real temporary SQLite (the same fixture pattern
 * used by tests/integration/shotUpdate.test.ts and
 * tests/integration/visualControl.test.ts). Each scenario controls its own
 * project/entity ownership shape and proves validation runs before any write,
 * so a failed repin leaves the shot byte-identical.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DomainError } from '@/domain/errors';
import { repinReferenceSchema, type ContinuityState } from '@/domain/schemas';
import type { Studio } from '@/application/ports';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('scriptServiceRepin');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createVisualControlService } = await import('@/application/services/visualControlService');

const studio = getStudio();
const projects = createProjectService(studio);
const episodesService = createEpisodeService(studio);
const scripts = createScriptService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

let fixtureCounter = 0;

const CONTINUITY_STATE: ContinuityState = {
  note: '',
  characters: {},
  environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] },
};

interface RepinFixture {
  projectId: string;
  projectSlug: string;
  sceneId: string;
  shotId: string;
  characterId: string;
  characterCode: string;
  locationId: string;
  locationCode: string;
  propId: string;
  propCode: string;
}

async function setupFixture(): Promise<RepinFixture> {
  fixtureCounter += 1;
  const n = fixtureCounter;
  const project = await projects.create({ title: `Repin Fixture ${n}`, aspectRatio: '16:9', durationTargetSeconds: 120 });
  const [episode] = await episodesService.listEpisodes(project.id);

  const scene = await studio.scenes.create(project.id, {
    episodeId: episode!.id,
    code: `RP-SC-${n}`,
    number: 1,
    title: 'Scene',
    timeOfDay: 'day',
    summary: '',
    action: '',
    dialogue: [],
    emotion: '',
    visualGoal: '',
    audioGoal: '',
    durationSeconds: 10,
    locationId: null,
    characters: [],
    status: 'draft',
  });

  const character = await studio.bibles.createCharacter(project.id, {
    code: `CHAR${String(n).padStart(3, '0')}`,
    name: 'Người một',
    role: 'lead',
    identity: {},
    variable: {},
    promptToken: 'nguoi mot',
    negativePrompt: '',
    forbiddenChanges: [],
    colorPalette: [],
    voiceProfileId: null,
    lockEnabled: true,
    status: 'draft',
  });
  await studio.bibles.updateCharacter(character.id, { name: 'Người một (v2)' });

  const location = await studio.bibles.createLocation(project.id, {
    code: `LOC${String(n).padStart(3, '0')}`,
    name: 'Nơi một',
    type: 'interior',
    era: '',
    details: {},
    promptBlock: '',
    negativePrompt: '',
    colorPalette: [],
    continuityNotes: '',
    status: 'draft',
  });
  await studio.bibles.updateLocation(location.id, { name: 'Nơi một (v2)' });

  const prop = await studio.bibles.createProp(project.id, {
    code: `PROP${String(n).padStart(3, '0')}`,
    name: 'Vật một',
    description: '',
    ownerCharacterId: null,
    details: {},
    promptToken: '',
    continuityConstraints: [],
    status: 'draft',
  });
  await studio.bibles.updateProp(prop.id, { name: 'Vật một (v2)' });

  const shot = await studio.shots.create(project.id, {
    sceneId: scene.id,
    code: `RP-SH-${n}`,
    shotNumber: 1,
    episodeId: episode!.id,
    title: 'Shot',
    description: 'original description',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'static' },
    lens: '50mm',
    durationSeconds: 5,
    characters: [{ characterId: character.id, versionId: `${character.code}_V1`, screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' }],
    location: { locationId: location.id, versionId: `${location.code}_V1` },
    props: [{ propId: prop.id, versionId: `${prop.code}_V1`, heldBy: null, state: 'intact' }],
    dialogue: '',
    emotion: 'neutral',
    lighting: 'day',
    visualEffects: [],
    soundEffects: [],
    continuity: {
      incoming: CONTINUITY_STATE,
      outgoing: CONTINUITY_STATE,
      intentionalChanges: [],
    },
    aspectRatio: '16:9',
    importance: 'normal',
  });

  return {
    projectId: project.id,
    projectSlug: project.slug,
    sceneId: scene.id,
    shotId: shot.id,
    characterId: character.id,
    characterCode: character.code,
    locationId: location.id,
    locationCode: location.code,
    propId: prop.id,
    propCode: prop.code,
  };
}

async function setupForeignEntityFixture(): Promise<{ projectSlug: string; shotId: string; foreignCharacterId: string; foreignLocationId: string; foreignPropId: string }> {
  const shot = await setupFixture();
  const other = await setupFixture();
  return {
    projectSlug: shot.projectSlug,
    shotId: shot.shotId,
    foreignCharacterId: other.characterId,
    foreignLocationId: other.locationId,
    foreignPropId: other.propId,
  };
}

describe('scriptService.repinShot — VC3 read-model evidence refresh', () => {
  it('refreshes the Visual Control read model after a successful repin', async () => {
    const f = await setupFixture();
    const visualControl = createVisualControlService(studio);

    const before = await visualControl.overview(f.projectSlug, f.shotId);
    const beforeChar = before.pinnedReferences.find((ref) => ref.kind === 'character' && ref.refId === f.characterId);
    expect(beforeChar).toMatchObject({ versionId: `${f.characterCode}_V1`, resolved: true });

    const updated = await scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.characterCode}_V2`,
    });
    expect(updated.characters[0]!.versionId).toBe(`${f.characterCode}_V2`);

    // The read model is re-derived on every read — no stored stale pin survives.
    const after = await visualControl.overview(f.projectSlug, f.shotId);
    const afterChar = after.pinnedReferences.find((ref) => ref.kind === 'character' && ref.refId === f.characterId);
    expect(afterChar).toMatchObject({ versionId: `${f.characterCode}_V2`, resolved: true, resolvableReason: null });
    expect(after.pinnedReferences.map((ref) => ref.versionId)).not.toContain(`${f.characterCode}_V1`);
  });
});

describe('scriptService.repinShot — valid repins', () => {
  it('valid character repin updates only the pinned version, preserving everything else', async () => {
    const f = await setupFixture();
    const before = await studio.shots.byId(f.shotId);
    const updated = await scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.characterCode}_V2`,
    });
    expect(updated.characters).toHaveLength(1);
    expect(updated.characters[0]).toMatchObject({ characterId: f.characterId, versionId: `${f.characterCode}_V2`, screenPosition: 'center', facing: 'to-camera' });
    expect(updated.title).toBe(before!.title);
    expect(updated.description).toBe(before!.description);
    expect(updated.locationId).toBe(before!.locationId);
    expect(updated.locationVersionId).toBe(before!.locationVersionId);
    expect(updated.props).toEqual(before!.props);
    expect(updated.dialogue).toBe(before!.dialogue);
    expect(updated.lighting).toBe(before!.lighting);
  });

  it('valid location repin keeps locationId and locationVersionId consistent', async () => {
    const f = await setupFixture();
    const updated = await scripts.repinShot({
      kind: 'location',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      locationId: f.locationId,
      versionId: `${f.locationCode}_V2`,
    });
    expect(updated.locationId).toBe(f.locationId);
    expect(updated.locationVersionId).toBe(`${f.locationCode}_V2`);
    expect(updated.characters[0]!.versionId).toBe(`${f.characterCode}_V1`);
    expect(updated.props[0]!.versionId).toBe(`${f.propCode}_V1`);
  });

  it('valid prop repin updates only the matching prop occurrence', async () => {
    const f = await setupFixture();
    const updated = await scripts.repinShot({
      kind: 'prop',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      propId: f.propId,
      versionId: `${f.propCode}_V2`,
    });
    expect(updated.props).toHaveLength(1);
    expect(updated.props[0]).toMatchObject({ propId: f.propId, versionId: `${f.propCode}_V2` });
    expect(updated.characters[0]!.versionId).toBe(`${f.characterCode}_V1`);
    expect(updated.locationVersionId).toBe(`${f.locationCode}_V1`);
  });

  it('repinning to the current version is a stable idempotent no-op', async () => {
    const f = await setupFixture();
    const before = await studio.shots.byId(f.shotId);
    const updated = await scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.characterCode}_V1`,
    });
    expect(updated.characters).toEqual(before!.characters);
    expect(updated.characters).toHaveLength(1);
    expect(updated.title).toBe(before!.title);
    expect(updated.locationId).toBe(before!.locationId);
    expect(updated.locationVersionId).toBe(before!.locationVersionId);
    expect(updated.props).toEqual(before!.props);
  });

  it('repinning a character that appears twice updates both occurrences in place without creating duplicates', async () => {
    const f = await setupFixture();
    const before = await studio.shots.byId(f.shotId);
    const shot = await studio.shots.update(f.shotId, {
      characters: [
        ...before!.characters,
        { characterId: f.characterId, versionId: `${f.characterCode}_V1`, screenPosition: 'left', facing: 'screen-left', action: 'waves', emotion: 'excited' },
      ],
    });
    expect(shot.characters).toHaveLength(2);
    const updated = await scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.characterCode}_V2`,
    });
    expect(updated.characters).toHaveLength(2);
    expect(updated.characters.every((ref) => ref.versionId === `${f.characterCode}_V2`)).toBe(true);
    expect(updated.characters[1]).toMatchObject({ screenPosition: 'left', action: 'waves' });
  });

  it('repinning a prop that appears twice keeps the same occurrence count and order', async () => {
    const f = await setupFixture();
    const before = await studio.shots.byId(f.shotId);
    const shot = await studio.shots.update(f.shotId, {
      props: [
        ...before!.props,
        { propId: f.propId, versionId: `${f.propCode}_V1`, heldBy: null, state: 'broken' },
      ],
    });
    expect(shot.props).toHaveLength(2);
    const updated = await scripts.repinShot({
      kind: 'prop',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      propId: f.propId,
      versionId: `${f.propCode}_V2`,
    });
    expect(updated.props).toHaveLength(2);
    expect(updated.props[0]).toMatchObject({ versionId: `${f.propCode}_V2`, state: 'intact' });
    expect(updated.props[1]).toMatchObject({ versionId: `${f.propCode}_V2`, state: 'broken' });
  });
});

describe('scriptService.repinShot — ownership and existence validation', () => {
  it('rejects a missing project with NOT_FOUND', async () => {
    const f = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: 'no-such-project',
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.characterCode}_V1`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a missing shot with NOT_FOUND', async () => {
    const f = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: 'shot_nonexistent',
      characterId: f.characterId,
      versionId: `${f.characterCode}_V1`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a shot from another project', async () => {
    const a = await setupFixture();
    const b = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: a.projectSlug,
      shotId: b.shotId,
      characterId: b.characterId,
      versionId: `${b.characterCode}_V1`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an entity from another project without touching the shot', async () => {
    const { projectSlug, shotId, foreignCharacterId, foreignLocationId, foreignPropId } = await setupForeignEntityFixture();
    for (const request of [
      { kind: 'character' as const, projectIdOrSlug: projectSlug, shotId, characterId: foreignCharacterId, versionId: `${'CHAR000'}_V1` },
      { kind: 'location' as const, projectIdOrSlug: projectSlug, shotId, locationId: foreignLocationId, versionId: `${'LOC000'}_V1` },
      { kind: 'prop' as const, projectIdOrSlug: projectSlug, shotId, propId: foreignPropId, versionId: `${'PROP000'}_V1` },
    ]) {
      const before = await studio.shots.byId(shotId);
      const promise = scripts.repinShot(request);
      await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await studio.shots.byId(shotId)).toEqual(before);
    }
  });

  it('rejects a version id whose code belongs to another entity', async () => {
    const f = await setupFixture();
    const other = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${other.characterCode}_V1`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a version number with no saved snapshot for the entity', async () => {
    const f = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.characterCode}_V99`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a wrong entity kind (a character request carrying a location snapshot id)', async () => {
    const f = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.locationCode}_V1`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a location repin when the shot pins a different location', async () => {
    const f = await setupFixture();
    const other = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'location',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      locationId: other.locationId,
      versionId: `${other.locationCode}_V1`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a character repin when the character is not in the shot', async () => {
    const f = await setupFixture();
    const other = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: other.characterId,
      versionId: `${other.characterCode}_V1`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a prop repin when the prop is not in the shot', async () => {
    const f = await setupFixture();
    const other = await setupFixture();
    const promise = scripts.repinShot({
      kind: 'prop',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      propId: other.propId,
      versionId: `${other.propCode}_V1`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('scriptService.repinShot — contract, schema and failure behavior', () => {
  it('rejects a malformed request (missing shotId) as a Zod error', async () => {
    const f = await setupFixture();
    const promise = scripts.repinShot({ kind: 'character', projectIdOrSlug: f.projectSlug, characterId: f.characterId, versionId: `${f.characterCode}_V1` } as never);
    await expect(promise).rejects.toBeInstanceOf(z.ZodError);
  });

  it('rejects an unsupported kind — style is absent from the contract (style mutation is rejected)', async () => {
    const style = repinReferenceSchema.safeParse({
      kind: 'style',
      projectIdOrSlug: 'slug',
      shotId: 'shot',
      styleId: 'style',
      versionId: 'STY001_V1',
    });
    expect(style.success).toBe(false);
    expect(repinReferenceSchema.options.map((option) => option.shape.kind.value)).toEqual(['character', 'location', 'prop']);
  });

  it('does not expose an unrestricted patch payload to the boundary', async () => {
    const f = await setupFixture();
    const patched = { kind: 'character', projectIdOrSlug: f.projectSlug, shotId: f.shotId, characterId: f.characterId, versionId: `${f.characterCode}_V2`, title: 'HACK' };
    const parsed = repinReferenceSchema.safeParse(patched);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('title' in parsed.data).toBe(false);
      expect(Object.keys(parsed.data).sort()).toEqual(['characterId', 'kind', 'projectIdOrSlug', 'shotId', 'versionId'].sort());
    }
    const updated = await scripts.repinShot({ kind: 'character', projectIdOrSlug: f.projectSlug, shotId: f.shotId, characterId: f.characterId, versionId: `${f.characterCode}_V2` });
    expect(updated.title).toBe('Shot');
    expect(updated.title).not.toBe('HACK');
  });

  it('preserves the complete previous shot state when validation fails', async () => {
    const f = await setupFixture();
    const before = await studio.shots.byId(f.shotId);
    const promise = scripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.characterCode}_V99`,
    });
    await expect(promise).rejects.toBeInstanceOf(DomainError);
    expect(await studio.shots.byId(f.shotId)).toEqual(before);
  });

  it('does not partially update and preserves state on a persistence failure', async () => {
    const f = await setupFixture();
    const before = await studio.shots.byId(f.shotId);
    const failingStudio = {
      ...studio,
      shots: {
        ...studio.shots,
        update: async () => {
          throw new DomainError('INTERNAL', 'simulated disk failure');
        },
      },
    } as unknown as Studio;
    const failingScripts = createScriptService(failingStudio);
    const promise = failingScripts.repinShot({
      kind: 'character',
      projectIdOrSlug: f.projectSlug,
      shotId: f.shotId,
      characterId: f.characterId,
      versionId: `${f.characterCode}_V2`,
    });
    await expect(promise).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(await studio.shots.byId(f.shotId)).toEqual(before);
  });
});
