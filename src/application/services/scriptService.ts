/**
 * Script → Scene → Shot pipeline.
 *
 * Design decisions worth knowing:
 *  - Parsing is deterministic (`src/domain/scriptParser.ts`). The LLM is used
 *    only to *enrich* scenes (summary, emotion, goals) and a failure there is
 *    logged and ignored — the pipeline never depends on a paid provider.
 *  - Parsing is idempotent but not silently destructive: re-parsing refuses to
 *    run when scenes already exist unless `replaceExisting` is passed, and a
 *    failure leaves the original script untouched.
 *  - Missing characters and locations named by the script are created as draft
 *    bible entries, so a shot always has something concrete to pin.
 */
import { z } from 'zod';
import { DomainError, notFound } from '@/domain/errors';
import { sceneCode as makeSceneCode, shotCode as makeShotCode } from '@/domain/ids';
import { parseScript, type ParsedScene } from '@/domain/scriptParser';
import { planSceneCoverage, recommendSplits, type SplitRecommendation } from '@/domain/shotPlanner';
import {
  repinReferenceSchema,
  saveScriptSchema,
  sceneInputSchema,
  shotInputSchema,
  updateShotSchema,
  type RepinReferenceInput,
  type SaveScriptInput,
} from '@/domain/schemas';
import type { Studio } from '../ports';
import type { CharacterRecord, LocationRecord, SceneRecord, ScriptRecord, ShotRecord } from '../records';
import { parseSnapshotId, snapshotIdFor } from './bibleService';
import { createTimelineService } from './timelineService';

const enrichmentSchema = z.object({
  scenes: z
    .array(
      z.object({
        sceneNumber: z.number().int(),
        summary: z.string().default(''),
        emotion: z.string().default(''),
        visualGoal: z.string().default(''),
        audioGoal: z.string().default(''),
      }),
    )
    .default([]),
});

/**
 * Operator-editable subset of `sceneInputSchema` (TASK-SCENE-SHOT-EDIT-SERVICES-001).
 * `number` is excluded at this boundary even though `SceneRepository.update`
 * already ignores it — scene ordering is never reachable through updateScene.
 * `code`/`id`/`episodeId`/`projectId` are not fields of `sceneInputSchema` at
 * all, so they are already unreachable through any patch built from it.
 */
const sceneUpdateSchema = sceneInputSchema.partial().omit({ number: true });

/**
 * Operator-editable subset of `updateShotSchema` (TASK-SCENE-SHOT-EDIT-SERVICES-001).
 * Excludes the pipeline-managed `status` field, the pinned bible-snapshot
 * `characters`/`location`/`props` references (excluded from this
 * prerequisite's scope entirely, not merely deferred) and `shotNumber`
 * (ordering, also already ignored by `ShotRepository.update`).
 */
const shotContentUpdateSchema = updateShotSchema.omit({
  status: true,
  characters: true,
  location: true,
  props: true,
  continuity: true,
  shotNumber: true,
});

export interface ParseResult {
  script: ScriptRecord;
  scenes: SceneRecord[];
  createdCharacters: CharacterRecord[];
  createdLocations: LocationRecord[];
  warnings: string[];
  enrichmentApplied: boolean;
}

export interface BuildShotsResult {
  shots: ShotRecord[];
  recommendations: { shotCode: string; findings: SplitRecommendation[] }[];
}

export function createScriptService(studio: Studio) {
  const { scripts, scenes, shots, bibles, episodes, projects, assets, activity, providers, logger } = studio;
  const timelineService = createTimelineService(studio);

  async function requireProject(idOrSlug: string) {
    const project = (await projects.byId(idOrSlug)) ?? (await projects.bySlug(idOrSlug));
    if (!project) throw new DomainError('NOT_FOUND', `Project not found: ${idOrSlug}`);
    return project;
  }

  /**
   * VC3 — a version id belongs to a bible entity only when its embedded code
   * matches the entity's code AND a saved snapshot exists for that exact
   * entity + version. A code from a different entity, a version number with no
   * snapshot, or a malformed id is rejected before any write is attempted.
   */
  async function requireVersionForEntity(
    kind: 'character' | 'location' | 'prop',
    entity: { id: string; code: string },
    versionId: string,
  ): Promise<void> {
    const { version } = parseSnapshotId(versionId);
    if (snapshotIdFor(entity.code, version) !== versionId) {
      throw new DomainError('VALIDATION_FAILED', `Version ${versionId} does not belong to this ${kind}.`);
    }
    const snapshot = await bibles.version(kind, entity.id, version);
    if (!snapshot) {
      throw new DomainError('VALIDATION_FAILED', `Version ${versionId} does not belong to this ${kind}.`);
    }
  }

  /** Finds a character by name, creating a draft bible entry if it is new. */
  async function ensureCharacter(
    projectId: string,
    name: string,
    created: CharacterRecord[],
  ): Promise<CharacterRecord> {
    const existing = (await bibles.listCharacters(projectId)).find(
      (character) => character.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;

    const code = await bibles.nextCode(projectId, 'character');
    const character = await bibles.createCharacter(projectId, {
      code,
      name,
      role: 'supporting',
      identity: {},
      variable: {},
      promptToken: name,
      negativePrompt: 'extra fingers, distorted face, inconsistent costume',
      forbiddenChanges: [],
      colorPalette: [],
      voiceProfileId: null,
      lockEnabled: true,
      status: 'draft',
    });
    created.push(character);
    return character;
  }

  async function ensureLocation(projectId: string, name: string, created: LocationRecord[]): Promise<LocationRecord> {
    const existing = (await bibles.listLocations(projectId)).find(
      (location) => location.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;

    const code = await bibles.nextCode(projectId, 'location');
    const location = await bibles.createLocation(projectId, {
      code,
      name,
      type: 'unspecified',
      era: '',
      details: {},
      promptBlock: '',
      negativePrompt: '',
      colorPalette: [],
      continuityNotes: '',
      status: 'draft',
    });
    created.push(location);
    return location;
  }

  /** Optional LLM pass. Never throws outward — enrichment is a bonus, not a step. */
  async function enrich(parsedScenes: ParsedScene[]): Promise<Map<number, z.infer<typeof enrichmentSchema>['scenes'][number]>> {
    const map = new Map<number, z.infer<typeof enrichmentSchema>['scenes'][number]>();
    if (parsedScenes.length === 0) return map;

    try {
      const provider = providers.text();
      const result = await provider.complete<unknown>({
        instruction:
          'You are a production script analyst. For each scene, write a one-sentence summary, a dominant emotion, a visual goal and an audio goal. Keep the original language.',
        input: parsedScenes
          .map((scene) => `Scene ${scene.number} — ${scene.title}\n${scene.action}\n${scene.dialogue.map((line) => `${line.characterName}: ${line.text}`).join('\n')}`)
          .join('\n\n'),
        model: providers.defaultModelFor('text'),
        jsonSchemaName: 'scene-enrichment',
      });
      const parsed = enrichmentSchema.safeParse(result.value);
      if (!parsed.success) {
        logger.warn('[script] enrichment response did not match its schema; continuing without it');
        return map;
      }
      for (const entry of parsed.data.scenes) map.set(entry.sceneNumber, entry);
    } catch (error) {
      logger.warn('[script] enrichment unavailable, continuing with the deterministic parse', {
        reason: (error as Error).message,
      });
    }
    return map;
  }

  return {
    async saveScript(projectIdOrSlug: string, raw: unknown): Promise<ScriptRecord> {
      const project = await requireProject(projectIdOrSlug);
      const input: SaveScriptInput = saveScriptSchema.parse(raw);
      const script = await scripts.save(project.id, input);
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'script.saved',
        targetType: 'script',
        targetId: script.id,
        details: { version: script.version, characters: input.raw.length },
      });
      return script;
    },

    async getScript(projectIdOrSlug: string): Promise<ScriptRecord | null> {
      const project = await requireProject(projectIdOrSlug);
      return scripts.current(project.id);
    },

    /** Dry run: what the parser would produce, with nothing persisted. */
    async preview(projectIdOrSlug: string) {
      const project = await requireProject(projectIdOrSlug);
      const script = await scripts.current(project.id);
      if (!script || !script.raw.trim()) {
        throw new DomainError('VALIDATION_FAILED', 'Save a script before parsing it.');
      }
      return parseScript(script.raw);
    },

    async parseIntoScenes(
      projectIdOrSlug: string,
      options: { replaceExisting?: boolean; episodeId?: string } = {},
    ): Promise<ParseResult> {
      const project = await requireProject(projectIdOrSlug);
      const script = await scripts.current(project.id);
      if (!script || !script.raw.trim()) {
        throw new DomainError('VALIDATION_FAILED', 'Save a script before parsing it.');
      }

      const existing = options.episodeId
        ? await scenes.listByEpisode(project.id, options.episodeId)
        : await scenes.listByProject(project.id);
      if (existing.length > 0 && !options.replaceExisting) {
        throw new DomainError(
          'CONFLICT',
          `This project already has ${existing.length} scene(s). Re-parsing would discard them — confirm the replace explicitly.`,
          { existingScenes: existing.length },
        );
      }

      const parsed = parseScript(script.raw);
      if (parsed.scenes.length === 0) {
        // The script is left exactly as it was; nothing is deleted on failure.
        throw new DomainError('VALIDATION_FAILED', 'No scenes could be parsed from this script.', {
          warnings: parsed.warnings,
        });
      }

      const enrichment = await enrich(parsed.scenes);
      const episode = options.episodeId
        ? await episodes.findById(options.episodeId).then((candidate) => {
            if (!candidate || candidate.projectId !== project.id) throw notFound('Episode', options.episodeId!);
            return candidate;
          })
        : await episodes.upsertFirst(project.id, `${project.title} — EP01`);

      if (existing.length > 0) {
        if (options.episodeId) {
          await scenes.deleteAllForEpisode(project.id, options.episodeId);
        } else {
          await scenes.deleteAllForProject(project.id);
        }
      }

      const createdCharacters: CharacterRecord[] = [];
      const createdLocations: LocationRecord[] = [];
      const savedScenes: SceneRecord[] = [];

      for (const parsedScene of parsed.scenes) {
        const location = await ensureLocation(project.id, parsedScene.locationName, createdLocations);
        // Sequential on purpose: code allocation reads the current max, so two
        // concurrent creates would race for the same CHARnnn.
        const characterRecords: CharacterRecord[] = [];
        for (const name of parsedScene.characterNames) {
          characterRecords.push(await ensureCharacter(project.id, name, createdCharacters));
        }
        const byName = new Map(characterRecords.map((character) => [character.name.toLowerCase(), character]));
        const extra = enrichment.get(parsedScene.number);

        const scene = await scenes.create(project.id, {
          code: makeSceneCode(parsedScene.number, episode.number),
          number: parsedScene.number,
          episodeId: episode.id,
          title: parsedScene.title,
          locationId: location.id,
          timeOfDay: parsedScene.timeOfDay,
          summary: extra?.summary || parsedScene.summary,
          action: parsedScene.action,
          dialogue: parsedScene.dialogue.map((line) => ({
            characterId: byName.get(line.characterName.toLowerCase())?.id ?? '',
            characterName: line.characterName,
            text: line.text,
            emotion: line.emotion,
            delivery: line.delivery,
            voiceId: '',
            durationEstimate: Math.max(1, Math.round(line.text.split(/\s+/).filter(Boolean).length / 2.6)),
          })),
          emotion: extra?.emotion ?? '',
          visualGoal: extra?.visualGoal ?? '',
          audioGoal: extra?.audioGoal ?? '',
          durationSeconds: parsedScene.estimatedDurationSeconds,
          characters: characterRecords.map((character) => character.id),
          status: 'draft',
        });
        savedScenes.push(scene);
      }

      await scripts.markParsed(script.id);
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'script.parsed',
        targetType: 'script',
        targetId: script.id,
        details: { scenes: savedScenes.length, replaced: existing.length },
      });

      return {
        script: { ...script, status: 'parsed' },
        scenes: savedScenes,
        createdCharacters,
        createdLocations,
        warnings: parsed.warnings,
        enrichmentApplied: enrichment.size > 0,
      };
    },

    /**
     * Builds shot coverage for every scene that has none. Existing shots are
     * never touched, so this is safe to run repeatedly.
     */
    async buildShots(projectIdOrSlug: string, episodeId?: string): Promise<BuildShotsResult> {
      const project = await requireProject(projectIdOrSlug);
      const sceneList = episodeId
        ? await scenes.listByEpisode(project.id, episodeId)
        : await scenes.listByProject(project.id);

      if (sceneList.length === 0) {
        throw new DomainError('VALIDATION_FAILED', 'Parse the script into scenes before building a shot list.');
      }

      const [characterList, propList] = await Promise.all([
        bibles.listCharacters(project.id),
        bibles.listProps(project.id),
      ]);
      const characterById = new Map(characterList.map((character) => [character.id, character]));
      const characterByName = new Map(characterList.map((character) => [character.name.toLowerCase(), character]));
      const locationList = await bibles.listLocations(project.id);
      const locationById = new Map(locationList.map((location) => [location.id, location]));

      const created: ShotRecord[] = [];
      const recommendations: BuildShotsResult['recommendations'] = [];

      for (const scene of sceneList) {
        const existing = await shots.listByScene(scene.id);
        if (existing.length > 0) continue;

        const location = scene.locationId ? locationById.get(scene.locationId) : undefined;
        const planned = planSceneCoverage({
          number: scene.number,
          title: scene.title,
          locationName: location?.name ?? 'Unspecified location',
          timeOfDay: scene.timeOfDay as ParsedScene['timeOfDay'],
          action: scene.action,
          summary: scene.summary,
          dialogue: scene.dialogue.map((line) => ({
            characterName: line.characterName,
            text: line.text,
            emotion: line.emotion,
            delivery: line.delivery,
          })),
          characterNames: scene.characters
            .map((id) => characterById.get(id)?.name)
            .filter((name): name is string => Boolean(name)),
          estimatedDurationSeconds: scene.durationSeconds,
        });

        let previousOutgoing: Record<string, ReturnType<typeof buildCharacterState>> = {};

        for (const plan of planned) {
          const refs = plan.characters.flatMap((entry) => {
            const character = characterByName.get(entry.characterName.toLowerCase());
            if (!character) return [];
            return [
              {
                characterId: character.id,
                versionId: snapshotIdFor(character.code, character.currentVersion),
                screenPosition: entry.screenPosition,
                facing: entry.facing,
                action: entry.action,
                emotion: entry.emotion,
              },
            ];
          });

          const incomingCharacters = Object.fromEntries(
            refs.map((ref) => {
              const character = characterById.get(ref.characterId);
              return [
                ref.characterId,
                previousOutgoing[ref.characterId] ?? buildCharacterState(character?.variable.costume ?? '', ref.facing),
              ];
            }),
          );
          const outgoingCharacters = Object.fromEntries(
            refs.map((ref) => {
              const character = characterById.get(ref.characterId);
              return [ref.characterId, buildCharacterState(character?.variable.costume ?? '', ref.facing)];
            }),
          );

          const environment = {
            time: scene.timeOfDay,
            weather: 'unspecified' as const,
            lightDirection: 'unspecified' as const,
            damagedObjects: [],
          };

          const shotNumber = plan.shotNumber;
          const input = shotInputSchema.parse({
            sceneId: scene.id,
            shotNumber,
            title: plan.title,
            description: plan.description,
            shotSize: plan.shotSize,
            cameraAngle: plan.cameraAngle,
            cameraMovement: plan.cameraMovement,
            lens: plan.lens,
            durationSeconds: plan.durationSeconds,
            characters: refs,
            location: scene.locationId
              ? {
                  locationId: scene.locationId,
                  versionId: location ? snapshotIdFor(location.code, location.currentVersion) : '',
                }
              : null,
            props: [],
            dialogue: plan.dialogue,
            emotion: plan.emotion,
            lighting: location?.details.lighting ?? '',
            visualEffects: [],
            soundEffects: [],
            continuity: {
              incoming: { note: plan.incomingNote, characters: incomingCharacters, environment },
              outgoing: { note: plan.outgoingNote, characters: outgoingCharacters, environment },
              intentionalChanges: [],
            },
            aspectRatio: project.aspectRatio,
            importance: plan.importance,
          });

          const shot = await shots.create(project.id, {
            ...input,
            code: makeShotCode(scene.number, shotNumber, 1),
            shotNumber,
            episodeId: scene.episodeId,
          });
          created.push(shot);
          previousOutgoing = outgoingCharacters;

          const findings = recommendSplits({
            characterCount: refs.length,
            dialogue: plan.dialogue,
            action: plan.description,
            propCount: propList.length > 0 ? 0 : 0,
            durationSeconds: plan.durationSeconds,
            cameraMovement: plan.cameraMovement,
            importance: plan.importance,
          });
          if (findings.length > 0) recommendations.push({ shotCode: shot.code, findings });
        }
      }

      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'shots.built',
        targetType: 'project',
        targetId: project.id,
        details: { created: created.length },
      });

      return { shots: created, recommendations };
    },

    /**
     * Deletes exactly one shot (TASK-REFINE-004). Soft delete only — never a
     * hard DELETE — so prompts/generations that still reference this shot's
     * id simply stop being reachable rather than becoming dangling foreign
     * keys. Dependent assets are classified individually:
     *   - not yet approved: soft-deleted alongside the shot (no independent
     *     meaning once the shot they were drafted for is gone);
     *   - already approved: detached (unassigned from the shot, never
     *     touched otherwise) because approved assets are immutable and must
     *     survive in the project's asset library regardless of shot deletion.
     * The scene/timeline is rebuilt and persisted immediately afterward so
     * readiness, the on-screen timeline and every subsequent export reflect
     * the deletion without a separate manual step.
     */
    async deleteShot(
      projectIdOrSlug: string,
      sceneId: string,
      shotId: string,
    ): Promise<{ deletedShotCode: string; nextShotCode: string | null }> {
      const project = await requireProject(projectIdOrSlug);
      const shot = await shots.byId(shotId);
      if (!shot || shot.projectId !== project.id || shot.sceneId !== sceneId) {
        throw notFound('Shot', shotId);
      }

      const sceneShots = await shots.listByScene(sceneId);
      const index = sceneShots.findIndex((candidate) => candidate.id === shot.id);
      const adjacent = sceneShots[index + 1] ?? sceneShots[index - 1] ?? null;

      const shotAssets = await assets.list(project.id, { shotId: shot.id, limit: 500 });
      for (const asset of shotAssets) {
        try {
          await assets.softDelete(asset.id);
        } catch (error) {
          if (error instanceof DomainError && error.code === 'IMMUTABLE_APPROVED_ASSET') {
            await assets.detachFromShot(asset.id);
          } else {
            throw error;
          }
        }
      }

      await shots.delete(shot.id);
      await timelineService.build(project.id, shot.episodeId ?? undefined);

      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'shot.deleted',
        targetType: 'shot',
        targetId: shot.id,
        details: { code: shot.code, sceneId: shot.sceneId, assetsHandled: shotAssets.length },
      });

      return { deletedShotCode: shot.code, nextShotCode: adjacent?.code ?? null };
    },

    /**
     * Ownership-checked content edit for an existing scene
     * (TASK-SCENE-SHOT-EDIT-SERVICES-001). Mirrors deleteShot's ownership
     * check: the scene must resolve inside the given project (and, when
     * `options.episodeId` is supplied, inside that episode too) or the whole
     * request is a stable 404, never a partial write. Never accepts
     * `number`/`code`/`episodeId` — those stay exactly as
     * `parseIntoScenes` left them. Does not implement create, delete or
     * reorder.
     */
    async updateScene(
      projectIdOrSlug: string,
      sceneId: string,
      raw: unknown,
      options: { episodeId?: string } = {},
    ): Promise<SceneRecord> {
      const project = await requireProject(projectIdOrSlug);

      if (options.episodeId) {
        const episode = await episodes.findById(options.episodeId);
        if (!episode || episode.projectId !== project.id) throw notFound('Episode', options.episodeId);
      }

      const current = await scenes.byId(sceneId);
      if (!current || current.projectId !== project.id) throw notFound('Scene', sceneId);
      if (options.episodeId && current.episodeId !== options.episodeId) throw notFound('Scene', sceneId);

      const patch = sceneUpdateSchema.parse(raw);
      const updated = await scenes.update(sceneId, patch);
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'scene.updated',
        targetType: 'scene',
        targetId: sceneId,
        details: { fields: Object.keys(patch) },
      });
      return updated;
    },

    /**
     * Ownership-checked content edit for an existing shot
     * (TASK-SCENE-SHOT-EDIT-SERVICES-001). `status` and every pinned
     * character/location/prop reference stay untouched here — they are
     * excluded from this prerequisite's scope entirely, not merely deferred.
     * Ownership check mirrors deleteShot exactly: the shot must resolve
     * inside the given project and the given scene, or the whole request is
     * a stable 404, never a partial write. Does not implement create,
     * delete or reorder (both already exist elsewhere for Shot).
     */
    async updateShot(
      projectIdOrSlug: string,
      sceneId: string,
      shotId: string,
      raw: unknown,
    ): Promise<ShotRecord> {
      const project = await requireProject(projectIdOrSlug);

      const scene = await scenes.byId(sceneId);
      if (!scene || scene.projectId !== project.id) throw notFound('Scene', sceneId);

      const shot = await shots.byId(shotId);
      if (!shot || shot.projectId !== project.id || shot.sceneId !== scene.id) {
        throw notFound('Shot', shotId);
      }

      const patch = shotContentUpdateSchema.parse(raw);
      const updated = await shots.update(shotId, patch);
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'shot.updated',
        targetType: 'shot',
        targetId: shotId,
        details: { fields: Object.keys(patch) },
      });
      return updated;
    },

    /**
     * VC3 (TASK-UI-VISUAL-CONTROL-001) — controlled repinning of one shot-level
     * Character/Location/Prop version pin. A single narrow, Zod-validated,
     * ownership-checked boundary: the permitted `ShotRepository.update()`
     * patch is constructed here and callers never pass a raw patch. Only the
     * existing shot-level fields `characters`, `locationId`,
     * `locationVersionId` and `props` are touched. Style is project-level and
     * read-only for VC3 — it has no branch in this contract.
     *
     * Every check runs before any write, so a validation failure leaves the
     * shot byte-identical; a persistence failure likewise (the update is a
     * single row write). Character/Prop repins update every existing ref with
     * that entity id in place — no new occurrence is created, order is
     * preserved, and repinning to the currently pinned version is a stable
     * no-op. Location repins keep `locationId` and `locationVersionId`
     * consistent by always writing both from the validated request.
     */
    async repinShot(input: RepinReferenceInput): Promise<ShotRecord> {
      const parsed = repinReferenceSchema.parse(input);
      const project = await requireProject(parsed.projectIdOrSlug);

      const shot = await shots.byId(parsed.shotId);
      if (!shot || shot.projectId !== project.id) throw notFound('Shot', parsed.shotId);

      if (parsed.kind === 'character') {
        const character = await bibles.characterById(parsed.characterId);
        if (!character || character.projectId !== project.id) {
          throw new DomainError('VALIDATION_FAILED', 'The character is not in this project.');
        }
        if (!shot.characters.some((ref) => ref.characterId === parsed.characterId)) {
          throw new DomainError('VALIDATION_FAILED', 'This shot has no pinned reference to that character.');
        }
        await requireVersionForEntity('character', character, parsed.versionId);
        const characters = shot.characters.map((ref) =>
          ref.characterId === parsed.characterId ? { ...ref, versionId: parsed.versionId } : ref,
        );
        const updated = await shots.update(shot.id, { characters });
        await activity.log({
          projectId: project.id,
          userId: null,
          action: 'shot.repinned',
          targetType: 'shot',
          targetId: shot.id,
          details: { kind: 'character', refId: parsed.characterId, versionId: parsed.versionId },
        });
        return updated;
      }

      if (parsed.kind === 'location') {
        const location = await bibles.locationById(parsed.locationId);
        if (!location || location.projectId !== project.id) {
          throw new DomainError('VALIDATION_FAILED', 'The location is not in this project.');
        }
        if (!shot.locationId || shot.locationId !== parsed.locationId) {
          throw new DomainError('VALIDATION_FAILED', 'This shot has no pinned reference to that location.');
        }
        await requireVersionForEntity('location', location, parsed.versionId);
        const updated = await shots.update(shot.id, {
          location: { locationId: parsed.locationId, versionId: parsed.versionId },
        });
        await activity.log({
          projectId: project.id,
          userId: null,
          action: 'shot.repinned',
          targetType: 'shot',
          targetId: shot.id,
          details: { kind: 'location', refId: parsed.locationId, versionId: parsed.versionId },
        });
        return updated;
      }

      const prop = await bibles.propById(parsed.propId);
      if (!prop || prop.projectId !== project.id) {
        throw new DomainError('VALIDATION_FAILED', 'The prop is not in this project.');
      }
      if (!shot.props.some((ref) => ref.propId === parsed.propId)) {
        throw new DomainError('VALIDATION_FAILED', 'This shot has no pinned reference to that prop.');
      }
      await requireVersionForEntity('prop', prop, parsed.versionId);
      const props = shot.props.map((ref) =>
        ref.propId === parsed.propId ? { ...ref, versionId: parsed.versionId } : ref,
      );
      const updated = await shots.update(shot.id, { props });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'shot.repinned',
        targetType: 'shot',
        targetId: shot.id,
        details: { kind: 'prop', refId: parsed.propId, versionId: parsed.versionId },
      });
      return updated;
    },
  };
}

function buildCharacterState(costume: string, facing: 'screen-left' | 'screen-right' | 'to-camera' | 'away-from-camera' | 'up' | 'down') {
  return {
    costume: costume || 'default costume',
    hair: 'as designed',
    injuries: [] as string[],
    heldProps: [] as string[],
    position: 'as blocked',
    facing,
  };
}

export type ScriptService = ReturnType<typeof createScriptService>;
