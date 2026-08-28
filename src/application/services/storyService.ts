/**
 * Story Development module (TASK-004).
 *
 * Turns a premise into a logline, synopsis, theme, tone, hook, cliffhanger and
 * a three-act beat sheet, persisted on `projects.creativeBrief`. Unlike script
 * enrichment (`scriptService.ts`), a provider failure here is not swallowed:
 * generation *is* the point of this screen, so the operator must see it fail —
 * and nothing is written until the response has validated, so a failed call
 * never touches the stored brief.
 *
 * Parts named in `creativeBrief.approvedParts` are locked: `regeneratePart`
 * and `save` refuse to touch them, and `generate` silently skips them rather
 * than overwriting an operator's accepted choice. `unlock` is the one
 * deliberate way to make a locked part editable again — approval is never
 * silently undone by a later regenerate.
 */
import type { z } from 'zod';
import { DomainError } from '@/domain/errors';
import {
  STORY_PARTS,
  acceptStoryPartsSchema,
  generateStorySchema,
  regenerateStoryPartSchema,
  saveStorySchema,
  storyDevelopmentSchema,
  unlockStoryPartsSchema,
  type AcceptStoryPartsInput,
  type CreativeBrief,
  type GenerateStoryInput,
  type RegenerateStoryPartInput,
  type SaveStoryInput,
  type StoryPart,
  type UnlockStoryPartsInput,
} from '@/domain/schemas';
import type { Studio } from '../ports';
import type { ProjectRecord } from '../records';

export interface StoryBrief {
  brief: CreativeBrief;
  approvedParts: StoryPart[];
}

export function createStoryService(studio: Studio) {
  const { projects, providers, activity, logger } = studio;

  async function requireProject(idOrSlug: string): Promise<ProjectRecord> {
    const project = (await projects.byId(idOrSlug)) ?? (await projects.bySlug(idOrSlug));
    if (!project) throw new DomainError('NOT_FOUND', `Project not found: ${idOrSlug}`);
    return project;
  }

  function toStoryBrief(project: ProjectRecord): StoryBrief {
    return { brief: project.creativeBrief, approvedParts: project.creativeBrief.approvedParts };
  }

  function assertNotApproved(project: ProjectRecord, parts: StoryPart[]): void {
    const locked = parts.filter((part) => project.creativeBrief.approvedParts.includes(part));
    if (locked.length > 0) {
      throw new DomainError(
        'CONFLICT',
        `These story parts are approved and locked: ${locked.join(', ')}. Unlock them first.`,
        { parts: locked },
      );
    }
  }

  /** Calls the text provider and validates the response before returning it. */
  async function callProvider(premise: string): Promise<z.infer<typeof storyDevelopmentSchema>> {
    let result: { value: unknown };
    try {
      const provider = providers.text();
      result = await provider.complete<unknown>({
        instruction:
          'You are a story development editor. From the premise, write a one-sentence logline, a short synopsis, ' +
          'the theme, the tone, an opening hook, a closing cliffhanger and a three-act beat sheet. Keep the ' +
          'original language.',
        input: premise,
        model: providers.defaultModelFor('text'),
        jsonSchemaName: 'story-development',
      });
    } catch (error) {
      logger.warn('[story] provider call failed', { reason: (error as Error).message });
      throw new DomainError('PROVIDER_UNAVAILABLE', 'The text provider could not generate a story development.', {
        reason: (error as Error).message,
      });
    }

    const parsed = storyDevelopmentSchema.safeParse(result.value);
    if (!parsed.success) {
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'The text provider response did not match the expected story development shape.',
        parsed.error.flatten(),
      );
    }
    return parsed.data;
  }

  return {
    async get(idOrSlug: string): Promise<StoryBrief> {
      return toStoryBrief(await requireProject(idOrSlug));
    },

    /**
     * Generates every part from a premise, then writes only the parts that
     * are not already approved. Approved parts are returned in `skipped`.
     */
    async generate(idOrSlug: string, raw: unknown): Promise<StoryBrief & { skipped: StoryPart[] }> {
      const project = await requireProject(idOrSlug);
      const input: GenerateStoryInput = generateStorySchema.parse(raw);
      const generated = await callProvider(input.premise);

      const approved = new Set(project.creativeBrief.approvedParts);
      const patch: Partial<CreativeBrief> = { premise: input.premise };
      const skipped: StoryPart[] = [];
      for (const [key, value] of Object.entries(generated) as [StoryPart, unknown][]) {
        if (approved.has(key)) {
          skipped.push(key);
          continue;
        }
        (patch as Record<string, unknown>)[key] = value;
      }

      const updated = await projects.update(project.id, { creativeBrief: patch });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'story.generated',
        targetType: 'project',
        targetId: project.id,
        details: { skipped },
      });

      return { ...toStoryBrief(updated), skipped };
    },

    async regeneratePart(idOrSlug: string, raw: unknown): Promise<StoryBrief> {
      const project = await requireProject(idOrSlug);
      const input: RegenerateStoryPartInput = regenerateStoryPartSchema.parse(raw);
      assertNotApproved(project, [input.part]);

      const premise = input.premise ?? project.creativeBrief.premise;
      if (!premise.trim()) {
        throw new DomainError('VALIDATION_FAILED', 'No premise on file — provide one to regenerate this part.');
      }

      const generated = await callProvider(premise);
      const patch: Partial<CreativeBrief> = { premise, [input.part]: generated[input.part] };

      const updated = await projects.update(project.id, { creativeBrief: patch });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'story.part_regenerated',
        targetType: 'project',
        targetId: project.id,
        details: { part: input.part },
      });

      return toStoryBrief(updated);
    },

    /** Manual edit. Refuses to touch any part named in `approvedParts`. */
    async save(idOrSlug: string, raw: unknown): Promise<StoryBrief> {
      const project = await requireProject(idOrSlug);
      const input: SaveStoryInput = saveStorySchema.parse(raw);
      const touchedParts = (Object.keys(input) as (keyof SaveStoryInput)[]).filter(
        (key): key is StoryPart => (STORY_PARTS as readonly string[]).includes(key),
      );
      assertNotApproved(project, touchedParts);

      const updated = await projects.update(project.id, { creativeBrief: input });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'story.saved',
        targetType: 'project',
        targetId: project.id,
        details: { fields: Object.keys(input) },
      });

      return toStoryBrief(updated);
    },

    /** Optionally writes edited values, then locks the named parts. */
    async accept(idOrSlug: string, raw: unknown): Promise<StoryBrief> {
      const project = await requireProject(idOrSlug);
      const input: AcceptStoryPartsInput = acceptStoryPartsSchema.parse(raw);

      const valuePatch = input.values ?? {};
      const approvedParts = Array.from(new Set([...project.creativeBrief.approvedParts, ...input.parts]));
      const patch: Partial<CreativeBrief> = { ...valuePatch, approvedParts };

      const updated = await projects.update(project.id, { creativeBrief: patch });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'story.accepted',
        targetType: 'project',
        targetId: project.id,
        details: { parts: input.parts },
      });

      return toStoryBrief(updated);
    },

    /** The deliberate act that makes an approved part editable/overwritable again. */
    async unlock(idOrSlug: string, raw: unknown): Promise<StoryBrief> {
      const project = await requireProject(idOrSlug);
      const input: UnlockStoryPartsInput = unlockStoryPartsSchema.parse(raw);
      const toUnlock = new Set(input.parts);
      const approvedParts = project.creativeBrief.approvedParts.filter((part) => !toUnlock.has(part));

      const updated = await projects.update(project.id, { creativeBrief: { approvedParts } });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'story.unlocked',
        targetType: 'project',
        targetId: project.id,
        details: { parts: input.parts },
      });

      return toStoryBrief(updated);
    },
  };
}

export type StoryService = ReturnType<typeof createStoryService>;
