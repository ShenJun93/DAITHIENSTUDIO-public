/**
 * Prompt Studio service.
 *
 * A prompt is never free text here. It is compiled from a shot plus the exact
 * bible snapshots the shot pinned, linted, and stored as an immutable version.
 * That is what makes "why does shot 7 look wrong?" an answerable question.
 */
import { DomainError, notFound } from '@/domain/errors';
import { applyLocks, type CompileContext } from '@/domain/prompt/compile';
import { lintPrompt, type LintContext } from '@/domain/prompt/lint';
import { promptBlocksSchema, type PromptBlocks, type LintResult } from '@/domain/schemas';
import type { Studio } from '../ports';
import type { PromptRecord, PromptVersionRecord, ShotRecord } from '../records';
import { createBibleService } from './bibleService';

export interface BuiltPrompt {
  prompt: PromptRecord;
  version: PromptVersionRecord;
  lint: LintResult;
}

export function createPromptService(studio: Studio) {
  const { prompts, shots, scenes, projects, bibles, activity, logger } = studio;
  const bibleService = createBibleService(studio);

  async function requireShot(shotId: string): Promise<ShotRecord> {
    const shot = await shots.byId(shotId);
    if (!shot) throw notFound('Shot', shotId);
    return shot;
  }

  /** Gathers every snapshot the shot pinned, in one place. */
  async function gatherContext(shot: ShotRecord, kind: 'image' | 'video'): Promise<CompileContext> {
    const project = await projects.byId(shot.projectId);
    if (!project) throw notFound('Project', shot.projectId);

    const characters = await Promise.all(
      shot.characters.map((ref) => bibleService.characterSnapshot(ref.characterId, ref.versionId)),
    );

    const location = shot.locationId
      ? await bibleService.locationSnapshot(shot.locationId, shot.locationVersionId ?? '')
      : null;

    const props = await Promise.all(shot.props.map((ref) => bibleService.propSnapshot(ref.propId, ref.versionId)));

    // The style is pinned per project; a shot inherits the project's current
    // style snapshot at compile time and the version is recorded in lockRefs.
    const style = await bibleService.currentStyle(shot.projectId);

    return {
      kind,
      characters,
      style,
      location,
      props,
      applyCharacterLock: true,
      applyStyleLock: true,
      applyLocationLock: true,
    };
  }

  /**
   * Seeds the human-editable blocks from the shot record so the operator starts
   * from the shot's own camera and action data rather than a blank page.
   */
  function blocksFromShot(shot: ShotRecord, sceneSummary: string): Partial<PromptBlocks> {
    const actions = shot.characters
      .map((ref) => (ref.action ? `${ref.action}` : ''))
      .filter(Boolean)
      .join('; ');
    const expressions = shot.characters
      .map((ref) => (ref.emotion ? `${ref.emotion}` : ''))
      .filter(Boolean)
      .join('; ');
    const positions = shot.characters
      .map((ref) => `${ref.screenPosition}, facing ${ref.facing}`)
      .join('; ');

    return {
      subject: shot.title || sceneSummary.slice(0, 160),
      action: actions || shot.description.slice(0, 400),
      expression: expressions || shot.emotion,
      composition: positions,
      shotSize: shot.shotSize,
      cameraAngle: shot.cameraAngle,
      lens: shot.lens,
      cameraMovement: `${shot.cameraMovement.speed} ${shot.cameraMovement.type}`.trim(),
      lighting: shot.lighting,
      motion: shot.characters.map((ref) => ref.action).filter(Boolean).join('; '),
      atmosphere: shot.emotion,
      continuity: [shot.continuity.incoming.note, shot.continuity.outgoing.note].filter(Boolean).join(' → '),
      technicalSettings: `${shot.aspectRatio}, ${shot.durationSeconds}s`,
    };
  }

  return {
    /** Compiles without persisting — used by the live preview in Prompt Studio. */
    async compilePreview(shotId: string, kind: 'image' | 'video', overrides: Partial<PromptBlocks> = {}) {
      const shot = await requireShot(shotId);
      const scene = await scenes.byId(shot.sceneId);
      const context = await gatherContext(shot, kind);
      const seeded = { ...blocksFromShot(shot, scene?.summary ?? ''), ...overrides };
      const compiled = applyLocks(seeded, context);
      const lint = lintPrompt(compiled.blocks, compiled.compiled, lintContextFor(shot, compiled, kind));
      return { ...compiled, lint, shot };
    },

    /**
     * Builds and persists a prompt version for a shot. Re-running adds a new
     * version rather than mutating the previous one.
     */
    async buildForShot(
      shotId: string,
      kind: 'image' | 'video' = 'image',
      overrides: Partial<PromptBlocks> = {},
    ): Promise<BuiltPrompt> {
      const shot = await requireShot(shotId);
      const scene = await scenes.byId(shot.sceneId);
      const context = await gatherContext(shot, kind);

      const seeded = { ...blocksFromShot(shot, scene?.summary ?? ''), ...promptBlocksSchema.partial().parse(overrides) };
      const compiled = applyLocks(seeded, context);
      const lint = lintPrompt(compiled.blocks, compiled.compiled, lintContextFor(shot, compiled, kind));

      if (!compiled.appliedLocks.character && shot.characters.length > 0) {
        throw new DomainError(
          'LOCK_REQUIRED',
          `Shot ${shot.code} has characters but Character Lock produced nothing. Check that each character has lockEnabled and a pinned snapshot.`,
        );
      }

      const existing = await prompts.findForShot(shot.id, kind);
      const payload = {
        blocks: compiled.blocks,
        compiled: compiled.compiled,
        negative: compiled.negative,
        lockRefs: compiled.lockRefs,
        lint,
      };

      if (existing) {
        const version = await prompts.addVersion(existing.id, payload);
        const prompt = await prompts.byId(existing.id);
        if (!prompt) throw notFound('Prompt', existing.id);
        await activity.log({
          projectId: shot.projectId,
          userId: null,
          action: 'prompt.versioned',
          targetType: 'prompt',
          targetId: prompt.id,
          details: { shotCode: shot.code, kind, version: version.version, lintScore: lint.score },
        });
        if (shot.status === 'planned') await shots.update(shot.id, { status: 'prompted' });
        return { prompt, version, lint };
      }

      const created = await prompts.createWithVersion({
        projectId: shot.projectId,
        shotId: shot.id,
        kind,
        name: `${shot.code} ${kind} prompt`,
        ...payload,
      });
      await activity.log({
        projectId: shot.projectId,
        userId: null,
        action: 'prompt.created',
        targetType: 'prompt',
        targetId: created.prompt.id,
        details: { shotCode: shot.code, kind, lintScore: lint.score },
      });
      if (shot.status === 'planned') await shots.update(shot.id, { status: 'prompted' });

      return { prompt: created.prompt, version: created.version, lint };
    },

    /** Builds prompts for every shot that has none. Skips shots already prompted. */
    async buildMissing(projectId: string, kind: 'image' | 'video' = 'image', episodeId?: string) {
      const shotList = episodeId ? await shots.listByEpisode(projectId, episodeId) : await shots.listByProject(projectId);
      const built: BuiltPrompt[] = [];
      const failures: { shotCode: string; reason: string }[] = [];

      for (const shot of shotList) {
        const existing = await prompts.findForShot(shot.id, kind);
        if (existing) continue;
        try {
          built.push(await this.buildForShot(shot.id, kind));
        } catch (error) {
          const reason = error instanceof DomainError ? error.message : (error as Error).message;
          logger.warn(`[prompt] could not build ${kind} prompt for ${shot.code}`, { reason });
          failures.push({ shotCode: shot.code, reason });
        }
      }
      return { built, failures };
    },

    async listForShot(shotId: string) {
      const promptList = await prompts.listByShot(shotId);
      return Promise.all(
        promptList.map(async (prompt) => ({
          prompt,
          versions: await prompts.versions(prompt.id),
        })),
      );
    },

    async latestForShot(shotId: string, kind: 'image' | 'video') {
      const prompt = await prompts.findForShot(shotId, kind);
      if (!prompt) return null;
      const version = await prompts.latestVersion(prompt.id);
      return version ? { prompt, version } : null;
    },

    /** Side-by-side comparison of two versions of the same prompt. */
    async compareVersions(promptId: string, left: number, right: number) {
      const [a, b] = await Promise.all([prompts.version(promptId, left), prompts.version(promptId, right)]);
      if (!a || !b) throw notFound('PromptVersion', `${promptId} v${left}/v${right}`);

      const leftLines = a.compiled.split('\n');
      const rightLines = b.compiled.split('\n');
      const labels = new Set([...leftLines, ...rightLines].map((line) => line.split(':')[0] ?? ''));
      const diff = [...labels]
        .filter(Boolean)
        .map((label) => ({
          block: label,
          left: leftLines.find((line) => line.startsWith(`${label}:`)) ?? '',
          right: rightLines.find((line) => line.startsWith(`${label}:`)) ?? '',
        }))
        .filter((entry) => entry.left !== entry.right);

      return { left: a, right: b, diff };
    },

    async versionsOf(promptId: string) {
      if (!(await prompts.byId(promptId))) throw notFound('Prompt', promptId);
      return prompts.versions(promptId);
    },

    /** Exposed so the shot page can show the bible versions actually in use. */
    async lockSummary(shotId: string, kind: 'image' | 'video') {
      const latest = await this.latestForShot(shotId, kind);
      if (!latest) return null;
      const refs = latest.version.lockRefs;
      const characters = await Promise.all(
        refs.characters.map(async (ref) => ({
          ...ref,
          name: (await bibles.characterById(ref.id))?.name ?? ref.code,
        })),
      );
      return { ...refs, characters };
    },
  };
}

function lintContextFor(
  shot: ShotRecord,
  compiled: { appliedLocks: { character: boolean; style: boolean; location: boolean } },
  kind: 'image' | 'video',
): LintContext {
  return {
    kind,
    hasCharactersInShot: shot.characters.length > 0,
    characterLockApplied: compiled.appliedLocks.character,
    styleLockApplied: compiled.appliedLocks.style,
    locationLockApplied: compiled.appliedLocks.location,
    shotHasLocation: Boolean(shot.locationId),
    requiresContinuity:
      shot.continuity.incoming.note.trim().length > 0 || Object.keys(shot.continuity.incoming.characters).length > 0,
  };
}

export type PromptService = ReturnType<typeof createPromptService>;
