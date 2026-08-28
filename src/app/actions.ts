'use server';

/**
 * Server actions — the mutation path for the UI.
 *
 * They call the same application services the REST API calls, so a screen and a
 * script cannot drift apart. Each action returns a plain result object rather
 * than throwing, so a form can render an error state instead of an error page.
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getStudio } from '@/infrastructure/container';
import { getAuthorizedActionStudio } from '@/app/_lib/actionAuth';
import { resolveOperatorIdFromRequest } from '@/app/_lib/operator';
import { createProjectService } from '@/application/services/projectService';
import { createEpisodeService } from '@/application/services/episodeService';
import { createScriptService } from '@/application/services/scriptService';
import { createStoryService } from '@/application/services/storyService';
import type { EnqueueVoiceGenerationInput, SaveStoryInput, StoryPart } from '@/domain/schemas';
import {
  assetDecisionActionInputSchema,
  assetQualityActionInputSchema,
  characterInputSchema,
  createEpisodeSchema,
  locationInputSchema,
  repinReferenceSchema,
  sceneInputSchema,
  shotInputSchema,
  updateEpisodeSchema,
} from '@/domain/schemas';
import { createProductFacingProjectSchema, productionTypeSchema } from '@/domain/productionTypeIdentity';
import { createBibleService } from '@/application/services/bibleService';
import { createProductionTypeAssignmentService } from '@/application/services/productionTypeAssignmentService';
import { createPromptService } from '@/application/services/promptService';
import { createGenerationService } from '@/application/services/generationService';
import { createSoundStudioService } from '@/application/services/soundStudioService';
import type { AudioMix } from '@/domain/schemas';
import { createAssetService } from '@/application/services/assetService';
import { createQualityService } from '@/application/services/qualityService';
import { createTimelineService } from '@/application/services/timelineService';
import { createExportService } from '@/application/services/exportService';
import { createPublishService } from '@/application/services/publishService';
import { createNodeGraphService } from '@/application/services/nodeGraphService';
import { createComposerService } from '@/application/services/composerService';
import { createWorkflowService } from '@/application/services/workflowService';
import { createProductionStrategyService } from '@/application/services/productionStrategyService';
import { createWorker } from '@/infrastructure/queue/worker';
import { DomainError, isDomainError } from '@/domain/errors';
import { STYLE_PRESETS } from '@/domain/styles/presets';
import { ZodError } from 'zod';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';
import { zodFieldErrors } from '@/app/_lib/zodFieldErrors';

export interface ActionResult {
  ok: boolean;
  message: string;
  code?: string;
  redirectTo?: string;
  resultUrl?: string;
  downloadUrl?: string;
  /** Field-name → message, for forms that render per-field validation errors. */
  fieldErrors?: Record<string, string>;
}

function failure(error: unknown): ActionResult {
  if (isDomainError(error)) return { ok: false, message: error.message, code: error.code };
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return {
      ok: false,
      message: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Validation failed',
      code: 'VALIDATION_FAILED',
    };
  }
  console.error('[action] unexpected error', error);
  return { ok: false, message: 'Something went wrong. Check the server log.', code: 'INTERNAL' };
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

export async function createProjectAction(form: FormData): Promise<ActionResult> {
  try {
    const raw = {
      title: text(form, 'title'),
      description: text(form, 'description'),
      genre: text(form, 'genre'),
      format: (text(form, 'format') || 'short-film') as 'short-film',
      platform: (text(form, 'platform') || 'youtube') as 'youtube',
      aspectRatio: (text(form, 'aspectRatio') || '16:9') as '16:9',
      durationTargetSeconds: Number(form.get('durationTargetSeconds') ?? 300),
      stylePresetKey: text(form, 'stylePresetKey') || STYLE_PRESETS[0]?.key,
      costLimitUsd: Number(form.get('costLimitUsd') ?? 25),
      productionType: text(form, 'productionType') || undefined,
    };
    const parsed = createProductFacingProjectSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        message: 'Check the highlighted fields.',
        code: 'VALIDATION_FAILED',
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }

    const project = await createProjectService(await getAuthorizedActionStudio()).create(parsed.data);
    revalidatePath('/projects');
    revalidatePath('/');
    return { ok: true, message: `Created ${project.title}`, redirectTo: `/projects/${project.slug}` };
  } catch (error) {
    return failure(error);
  }
}

export async function changeProjectProductionTypeAction(
  slug: string,
  input: { productionType: any, confirmExistingProductionData?: boolean }
): Promise<ActionResult & { status?: string, evidence?: readonly string[] }> {
  try {
    const parsed = z.object({
      productionType: productionTypeSchema.nullable(),
      confirmExistingProductionData: z.boolean().optional()
    }).safeParse(input);

    if (!parsed.success) {
      return { ok: false, message: 'Invalid input', code: 'VALIDATION_FAILED' };
    }

    const studio = await getAuthorizedActionStudio();
    const result = await createProductionTypeAssignmentService(studio).change(slug, parsed.data);
    revalidatePath(`/projects/${slug}`);
    revalidatePath('/projects');
    return { ok: true, message: 'Updated', status: result.status, evidence: result.evidence };
  } catch (error) {
    return failure(error);
  }
}

export async function createEpisodeAction(slug: string, form: FormData): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const parsed = createEpisodeSchema.safeParse({
      title: text(form, 'title'),
      synopsis: text(form, 'synopsis'),
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: 'Check the highlighted fields.',
        code: 'VALIDATION_FAILED',
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }
    const project = await createProjectService(studio).get(slug);
    const episode = await createEpisodeService(studio).createEpisode(project.id, parsed.data);
    revalidatePath(`/projects/${slug}`);
    return { ok: true, message: `Created episode ${episode.code}` };
  } catch (error) {
    return failure(error);
  }
}

export async function updateEpisodeAction(slug: string, episodeId: string, form: FormData): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const parsed = updateEpisodeSchema.safeParse({
      title: text(form, 'title'),
      synopsis: text(form, 'synopsis'),
      status: text(form, 'status') || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: 'Check the highlighted fields.',
        code: 'VALIDATION_FAILED',
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }
    const project = await createProjectService(studio).get(slug);
    const ownedEpisode = await studio.episodes.findById(episodeId);
    if (!ownedEpisode || ownedEpisode.projectId !== project.id) {
      return { ok: false, message: 'Episode not found for this project.', code: 'NOT_FOUND' };
    }
    const episode = await createEpisodeService(studio).updateEpisode(episodeId, parsed.data);
    revalidatePath(`/projects/${slug}`);
    return { ok: true, message: `Updated episode ${episode.code}` };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteEpisodeAction(slug: string, episodeId: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const ownedEpisode = await studio.episodes.findById(episodeId);
    if (!ownedEpisode || ownedEpisode.projectId !== project.id) {
      return { ok: false, message: 'Episode not found for this project.', code: 'NOT_FOUND' };
    }
    await createEpisodeService(studio).deleteEpisode(episodeId);
    revalidatePath(`/projects/${slug}`);
    return { ok: true, message: 'Episode deleted' };
  } catch (error) {
    return failure(error);
  }
}

export async function setActiveEpisodeAction(projectId: string, episodeId: string): Promise<ActionResult> {
  try {
    const episode = await (await getAuthorizedActionStudio()).episodes.findById(episodeId);
    if (!episode || episode.projectId !== projectId) {
      return { ok: false, message: 'Episode not found for this project.', code: 'NOT_FOUND' };
    }
    const cookieStore = await cookies();
    cookieStore.set(`studio_ep_${projectId}`, episodeId, { path: '/', httpOnly: true, sameSite: 'lax' });
    return { ok: true, message: 'Episode context updated' };
  } catch (error) {
    return failure(error);
  }
}

export async function saveScriptAction(slug: string, form: FormData): Promise<ActionResult> {
  try {
    await createScriptService(await getAuthorizedActionStudio()).saveScript(slug, {
      title: text(form, 'title') || 'Main script',
      scriptType: (text(form, 'scriptType') || 'motion-comic') as 'motion-comic',
      raw: String(form.get('raw') ?? ''),
    });
    revalidatePath(`/projects/${slug}/script`);
    return { ok: true, message: 'Script saved.' };
  } catch (error) {
    return failure(error);
  }
}

export async function parseScriptAction(slug: string, replaceExisting: boolean): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const activeEpisode = await getActiveEpisode(studio, project.id);
    const result = await createScriptService(studio).parseIntoScenes(slug, { replaceExisting, episodeId: activeEpisode?.id });
    revalidatePath(`/projects/${slug}/script`);
    return {
      ok: true,
      message: `Parsed ${result.scenes.length} scenes. Found ${result.createdCharacters.length} new characters.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function generateStoryAction(slug: string, premise: string): Promise<ActionResult> {
  try {
    const result = await createStoryService(await getAuthorizedActionStudio()).generate(slug, { premise });
    revalidatePath(`/projects/${slug}/story`);
    return {
      ok: true,
      message:
        result.skipped.length > 0
          ? `Generated. ${result.skipped.length} approved part(s) were left untouched.`
          : 'Generated a new story development.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function regenerateStoryPartAction(
  slug: string,
  part: StoryPart,
  premise?: string,
): Promise<ActionResult> {
  try {
    await createStoryService(await getAuthorizedActionStudio()).regeneratePart(slug, { part, premise });
    revalidatePath(`/projects/${slug}/story`);
    return { ok: true, message: `Regenerated "${part}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function saveStoryDraftAction(slug: string, values: SaveStoryInput): Promise<ActionResult> {
  try {
    await createStoryService(await getAuthorizedActionStudio()).save(slug, values);
    revalidatePath(`/projects/${slug}/story`);
    return { ok: true, message: 'Saved.' };
  } catch (error) {
    return failure(error);
  }
}

export async function acceptStoryPartsAction(
  slug: string,
  parts: StoryPart[],
  values?: SaveStoryInput,
): Promise<ActionResult> {
  try {
    await createStoryService(await getAuthorizedActionStudio()).accept(slug, { parts, values });
    revalidatePath(`/projects/${slug}/story`);
    return { ok: true, message: `Accepted ${parts.join(', ')}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function unlockStoryPartsAction(slug: string, parts: StoryPart[]): Promise<ActionResult> {
  try {
    await createStoryService(await getAuthorizedActionStudio()).unlock(slug, { parts });
    revalidatePath(`/projects/${slug}/story`);
    return { ok: true, message: `Unlocked ${parts.join(', ')}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function buildShotsAction(slug: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const activeEpisode = await getActiveEpisode(studio, project.id);
    const result = await createScriptService(studio).buildShots(slug, activeEpisode?.id);
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: `Created ${result.shots.length} shot(s). ${result.recommendations.length} planner recommendation(s).`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function reorderShotsAction(slug: string, sceneId: string, shotIds: string[]): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const scene = await studio.scenes.byId(sceneId);
    if (!scene) return { ok: false, message: `Scene not found: ${sceneId}`, code: 'NOT_FOUND' };
    await studio.shots.reorder(sceneId, shotIds);
    revalidatePath(`/projects/${slug}/shots`);
    return { ok: true, message: 'Shot order saved.' };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteShotAction(slug: string, sceneId: string, shotId: string): Promise<ActionResult> {
  try {
    const result = await createScriptService(await getAuthorizedActionStudio()).deleteShot(slug, sceneId, shotId);
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: `Deleted shot ${result.deletedShotCode}.`,
      redirectTo: `/projects/${slug}/shots`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function createVoiceProfileAction(slug: string, form: FormData): Promise<ActionResult> {
  try {
    const profile = await createBibleService(await getAuthorizedActionStudio()).createVoiceProfile(slug, {
      name: text(form, 'name'),
      provider: text(form, 'provider') || 'mock',
      language: text(form, 'language') || 'vi-VN',
      voiceName: text(form, 'voiceName'),
      speed: Number(form.get('speed') ?? 1),
      pitch: Number(form.get('pitch') ?? 0),
      emotion: text(form, 'emotion') || 'neutral',
      style: text(form, 'style'),
    });
    revalidatePath(`/projects/${slug}/voice`);
    return { ok: true, message: `Created voice profile "${profile.name}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function assignVoiceProfileAction(
  slug: string,
  characterId: string,
  voiceProfileId: string | null,
): Promise<ActionResult> {
  try {
    await createBibleService(await getAuthorizedActionStudio()).updateCharacter(characterId, { voiceProfileId });
    revalidatePath(`/projects/${slug}/voice`);
    return { ok: true, message: voiceProfileId ? 'Voice profile assigned.' : 'Voice profile cleared.' };
  } catch (error) {
    return failure(error);
  }
}

export async function updateVoiceProfileAction(slug: string, profileId: string, form: FormData): Promise<ActionResult> {
  try {
    const profile = await createBibleService(await getAuthorizedActionStudio()).updateVoiceProfile(profileId, {
      name: text(form, 'name'),
      provider: text(form, 'provider') || 'mock',
      language: text(form, 'language') || 'vi-VN',
      voiceName: text(form, 'voiceName'),
      speed: Number(form.get('speed') ?? 1),
      pitch: Number(form.get('pitch') ?? 0),
      emotion: text(form, 'emotion') || 'neutral',
      style: text(form, 'style'),
    });
    revalidatePath(`/projects/${slug}/voice`);
    return { ok: true, message: `Updated voice profile "${profile.name}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteVoiceProfileAction(slug: string, profileId: string): Promise<ActionResult> {
  try {
    await createBibleService(await getAuthorizedActionStudio()).deleteVoiceProfile(profileId);
    revalidatePath(`/projects/${slug}/voice`);
    return { ok: true, message: 'Voice profile deleted.' };
  } catch (error) {
    return failure(error);
  }
}

const listField = (form: FormData, key: string): string[] =>
  text(form, key)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * TASK-UI-CORE-EDITORS-001 Slice 1: manual character creation. Calls the
 * existing, unchanged bibleService.createCharacter — `code` is never
 * accepted from the form, so it is always server-assigned via
 * bibles.nextCode and can never collide with an existing project code.
 * Pre-validates with the real characterInputSchema (not a parallel
 * hand-written check) so field-specific messages can be returned even
 * though the service re-validates the same way internally.
 */
export async function createCharacterAction(slug: string, form: FormData): Promise<ActionResult> {
  const raw = {
    name: text(form, 'name'),
    role: text(form, 'role') || undefined,
    promptToken: text(form, 'promptToken') || undefined,
    negativePrompt: text(form, 'negativePrompt') || undefined,
    lockEnabled: form.get('lockEnabled') === 'on',
    status: text(form, 'status') || undefined,
  };
  const parsed = characterInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Check the highlighted fields.',
      code: 'VALIDATION_FAILED',
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  try {
    const character = await createBibleService(await getAuthorizedActionStudio()).createCharacter(slug, parsed.data);
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: `Created character ${character.code}.`,
      redirectTo: `/projects/${slug}/workspace/characters`,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * TASK-UI-CORE-EDITORS-001 Slice 2: manual location creation, same shape as
 * Slice 1's createCharacterAction. Calls the existing, unchanged
 * bibleService.createLocation — `code` is never accepted from the form, so
 * it is always server-assigned via bibles.nextCode. Only a deliberately
 * compact subset of locationInputSchema is exposed (name, type, era,
 * promptBlock, negativePrompt, status); details.*, colorPalette and
 * continuityNotes stay reachable at the existing, unchanged
 * /projects/[slug]/bibles update form, matching Slice 1's precedent of
 * deferring structured/secondary fields to the existing editor. Location has
 * no lockEnabled field anywhere in the domain model — none is submitted here.
 */
export async function createLocationAction(slug: string, form: FormData): Promise<ActionResult> {
  const raw = {
    name: text(form, 'name'),
    type: text(form, 'type') || undefined,
    era: text(form, 'era') || undefined,
    promptBlock: text(form, 'promptBlock') || undefined,
    negativePrompt: text(form, 'negativePrompt') || undefined,
    status: text(form, 'status') || undefined,
  };
  const parsed = locationInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Check the highlighted fields.',
      code: 'VALIDATION_FAILED',
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  try {
    const location = await createBibleService(await getAuthorizedActionStudio()).createLocation(slug, parsed.data);
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: `Created location ${location.code}.`,
      redirectTo: `/projects/${slug}/workspace/locations`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCharacterAction(slug: string, characterId: string, form: FormData): Promise<ActionResult> {
  try {
    const character = await createBibleService(await getAuthorizedActionStudio()).updateCharacter(characterId, {
      name: text(form, 'name'),
      role: text(form, 'role'),
      promptToken: text(form, 'promptToken'),
      negativePrompt: text(form, 'negativePrompt'),
      forbiddenChanges: listField(form, 'forbiddenChanges'),
      colorPalette: listField(form, 'colorPalette'),
      lockEnabled: form.get('lockEnabled') === 'on',
      status: text(form, 'status') || 'draft',
      identity: {
        ageRange: text(form, 'ageRange'),
        species: text(form, 'species'),
        genderPresentation: text(form, 'genderPresentation'),
        height: text(form, 'height'),
        bodyType: text(form, 'bodyType'),
        faceShape: text(form, 'faceShape'),
        skinTone: text(form, 'skinTone'),
        hair: text(form, 'hair'),
        eyes: text(form, 'eyes'),
        distinguishingMarks: listField(form, 'distinguishingMarks'),
      },
      variable: {
        costume: text(form, 'costume'),
        accessories: listField(form, 'accessories'),
      },
    });
    revalidatePath(`/projects/${slug}/bibles`);
    return { ok: true, message: `Saved ${character.name} (v${character.currentVersion}).` };
  } catch (error) {
    return failure(error);
  }
}

export async function updateLocationAction(slug: string, locationId: string, form: FormData): Promise<ActionResult> {
  try {
    const location = await createBibleService(await getAuthorizedActionStudio()).updateLocation(locationId, {
      name: text(form, 'name'),
      type: text(form, 'type'),
      era: text(form, 'era'),
      status: text(form, 'status') || 'draft',
      promptBlock: text(form, 'promptBlock'),
      negativePrompt: text(form, 'negativePrompt'),
      colorPalette: listField(form, 'colorPalette'),
      continuityNotes: text(form, 'continuityNotes'),
    });
    revalidatePath(`/projects/${slug}/bibles`);
    return { ok: true, message: `Saved ${location.name} (v${location.currentVersion}).` };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Content-field-only subset of sceneInputSchema this action accepts,
 * mirroring scriptService.ts's own private `sceneUpdateSchema` exactly
 * (same `.partial().omit({ number: true })` derivation from the same
 * exported `sceneInputSchema`) so field-level errors can be built here
 * before the ownership-checked service call, without reaching into
 * scriptService.ts's unexported schema. `dialogue` and `characters` are
 * contract-authorized but deliberately not exposed by the Scene Editor
 * form (TASK-UI-CORE-EDITORS-001 Scene Editor slice) — they are simply
 * never included in the submitted patch, and SceneRepository.update only
 * writes keys it is given (confirmed by reading production.ts), so
 * omitting them leaves the scene's existing values untouched.
 */
const sceneUpdateFormSchema = sceneInputSchema.partial().omit({ number: true });

export async function updateSceneAction(
  slug: string,
  sceneId: string,
  episodeId: string | undefined,
  form: FormData,
): Promise<ActionResult> {
  const raw = {
    title: text(form, 'title'),
    locationId: text(form, 'locationId') || null,
    timeOfDay: text(form, 'timeOfDay'),
    summary: text(form, 'summary'),
    action: text(form, 'action'),
    emotion: text(form, 'emotion'),
    visualGoal: text(form, 'visualGoal'),
    audioGoal: text(form, 'audioGoal'),
    durationSeconds: Number(form.get('durationSeconds') ?? 0),
    status: text(form, 'status'),
  };
  const parsed = sceneUpdateFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Check the highlighted fields.',
      code: 'VALIDATION_FAILED',
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  try {
    const scene = await createScriptService(await getAuthorizedActionStudio()).updateScene(
      slug,
      sceneId,
      parsed.data,
      episodeId ? { episodeId } : {},
    );
    revalidatePath(`/projects/${slug}/scenes/${encodeURIComponent(scene.code)}/edit`);
    revalidatePath(`/projects/${slug}/scenes`);
    return { ok: true, message: `Saved scene ${scene.code}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function updatePropAction(slug: string, propId: string, form: FormData): Promise<ActionResult> {
  try {
    const prop = await createBibleService(await getAuthorizedActionStudio()).updateProp(propId, {
      name: text(form, 'name'),
      description: text(form, 'description'),
      ownerCharacterId: text(form, 'ownerCharacterId') || null,
      promptToken: text(form, 'promptToken'),
      continuityConstraints: listField(form, 'continuityConstraints'),
      status: text(form, 'status') || 'draft',
      details: {
        material: text(form, 'material'),
        color: text(form, 'color'),
        condition: text(form, 'condition'),
        dimensions: text(form, 'dimensions'),
      },
    });
    revalidatePath(`/projects/${slug}/bibles`);
    return { ok: true, message: `Saved ${prop.name} (v${prop.currentVersion}).` };
  } catch (error) {
    return failure(error);
  }
}

export async function updateStyleAction(slug: string, styleId: string, form: FormData): Promise<ActionResult> {
  try {
    const style = await createBibleService(await getAuthorizedActionStudio()).updateStyle(styleId, {
      name: text(form, 'name'),
      category: text(form, 'category') || 'stylized-3d',
      status: text(form, 'status') || 'draft',
      promptBlock: text(form, 'promptBlock'),
      negativeStyleRules: text(form, 'negativeStyleRules'),
    });
    revalidatePath(`/projects/${slug}/bibles`);
    return { ok: true, message: `Saved ${style.name} (v${style.currentVersion}).` };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Voice synthesis has no Prompt Studio step (no Character Lock to compile) —
 * the shot's dialogue is queued as raw text, same as `seed.ts`.
 */
export async function enqueueVoiceGenerationAction(
  slug: string,
  input: EnqueueVoiceGenerationInput,
): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const shot = await studio.shots.byId(input.shotId);
    if (!shot) return { ok: false, message: `Shot not found: ${input.shotId}`, code: 'NOT_FOUND' };
    if (!shot.dialogue.trim()) {
      return { ok: false, message: 'This shot has no dialogue to synthesize.', code: 'VALIDATION_FAILED' };
    }

    const result = await createGenerationService(studio).enqueue({
      projectId: project.id,
      shotId: shot.id,
      kind: 'voice',
      prompt: shot.dialogue,
      params: {
        language: input.language ?? project.language,
        voiceName: input.voiceName ?? '',
        speed: input.speed ?? 1,
        pitch: input.pitch ?? 0,
        emotion: input.emotion ?? '',
      },
      referenceAssetIds: [],
      priority: 20,
    });
    revalidatePath(`/projects/${slug}/voice`);
    return {
      ok: true,
      message: result.reused
        ? 'An identical voice job already exists — reused it instead of spending again.'
        : `Queued voice job (est. $${result.generation.estimatedCostUsd.toFixed(4)}).`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function buildPromptsAction(slug: string, kind: 'image' | 'video'): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const activeEpisode = await getActiveEpisode(studio, project.id);
    const result = await createPromptService(studio).buildMissing(project.id, kind, activeEpisode?.id);
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: result.failures.length === 0,
      message: `Compiled ${result.built.length} ${kind} prompt(s).${
        result.failures.length > 0 ? ` ${result.failures.length} failed: ${result.failures[0]?.reason ?? ''}` : ''
      }`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function buildPromptForShotAction(
  slug: string,
  shotId: string,
  kind: 'image' | 'video',
): Promise<ActionResult> {
  try {
    const result = await createPromptService(await getAuthorizedActionStudio()).buildForShot(shotId, kind);
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: result.lint.ok,
      message: `Prompt v${result.version.version} compiled — lint score ${result.lint.score}/100${
        result.lint.ok ? '' : `, ${result.lint.issues.filter((i) => i.severity === 'error').length} blocking issue(s)`
      }.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function enqueueGenerationAction(
  slug: string,
  shotId: string,
  kind: 'image' | 'video',
): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const prompt = await studio.prompts.findForShot(shotId, kind);
    if (!prompt) return { ok: false, message: `Compile the ${kind} prompt first.`, code: 'MISSING_REFERENCE' };

    const result = await createGenerationService(studio).enqueue({
      projectId: project.id,
      shotId,
      promptId: prompt.id,
      kind,
      params: {},
      referenceAssetIds: [],
      priority: kind === 'image' ? 50 : 100,
    });
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: result.reused
        ? 'An identical job already exists — reused it instead of spending again.'
        : `Queued ${kind} job (est. $${result.generation.estimatedCostUsd.toFixed(4)}).${
            result.warnings.length > 0 ? ` Warnings: ${result.warnings.length}` : ''
          }`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function drainQueueAction(slug: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    await createProjectService(studio).get(slug);
    const processed = await createWorker(studio, { workerId: 'ui-drain' }).drain(20);
    revalidatePath(`/projects/${slug}`, 'layout');
    return { ok: true, message: processed === 0 ? 'Queue is already empty.' : `Processed ${processed} job(s).` };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelGenerationAction(slug: string, generationId: string): Promise<ActionResult> {
  try {
    await createGenerationService(await getAuthorizedActionStudio()).cancel(generationId);
    revalidatePath(`/projects/${slug}`, 'layout');
    return { ok: true, message: 'Job cancelled.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideAssetAction(
  slug: string,
  assetId: string,
  decision: 'approved' | 'rejected',
  note: string,
): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const input = assetDecisionActionInputSchema.parse({ slug, assetId, decision, note });
    const project = await createProjectService(studio).get(input.slug);
    const asset = await studio.assets.byId(input.assetId);
    if (!asset || asset.projectId !== project.id) {
      throw new DomainError('NOT_FOUND', 'Asset not found in this project.');
    }
    const decidedBy = await resolveOperatorIdFromRequest(studio);
    await createAssetService(studio).decide(input.assetId, input.decision, input.note, decidedBy);
    revalidatePath(`/projects/${input.slug}`, 'layout');
    return { ok: true, message: `Asset ${input.decision}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadAssetAction(slug: string, form: FormData): Promise<ActionResult> {
  try {
    const file = form.get('file');
    if (!(file instanceof File)) return { ok: false, message: 'Choose a file first.', code: 'VALIDATION_FAILED' };

    const shotId = text(form, 'shotId') || null;
    const tags = text(form, 'tags')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const studio = await getAuthorizedActionStudio();
    const asset = await createAssetService(studio).upload(
      slug,
      {
        shotId,
        kind: text(form, 'kind') || 'image',
        name: text(form, 'name') || file.name,
        mimeType: file.type || 'application/octet-stream',
        tags,
        metadata: {
          originType: 'manual-import',
          originTool: text(form, 'originTool'),
          originModel: text(form, 'originModel'),
          usageRights: text(form, 'usageRights'),
        },
      },
      {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: Buffer.from(await file.arrayBuffer()),
      },
    );
    const bindingTarget = text(form, 'bindingTarget');
    if (bindingTarget) {
      const [targetType, targetId, targetVersionId, role, extra] = bindingTarget.split('|');
      if (extra !== undefined || !targetType || !targetId || !role) {
        return { ok: false, message: 'The selected production target is invalid.', code: 'VALIDATION_FAILED' };
      }
      await createProductionStrategyService(studio).bind(slug, {
        assetId: asset.id,
        targetType,
        targetId,
        targetVersionId: targetVersionId ?? '',
        role,
      });
    }
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: bindingTarget
        ? `Uploaded and bound "${asset.name}". Approve it before production can use it.`
        : `Uploaded "${asset.name}".`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function setProductionStrategyAction(
  slug: string,
  strategy: 'hybrid' | 'auto',
): Promise<ActionResult> {
  try {
    await createProductionStrategyService(await getAuthorizedActionStudio()).setStrategy(slug, strategy);
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: strategy === 'hybrid'
        ? 'Hybrid selected. Only approved, version-bound imports will be used.'
        : 'Auto selected. Only provider-generated shot media will be used.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function checkQualityAction(slug: string, assetId: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const input = assetQualityActionInputSchema.parse({ slug, assetId });
    const project = await createProjectService(studio).get(input.slug);
    const asset = await studio.assets.byId(input.assetId);
    if (!asset || asset.projectId !== project.id) {
      throw new DomainError('NOT_FOUND', 'Asset not found in this project.');
    }
    const report = await createQualityService(studio).checkAsset(input.assetId);
    revalidatePath(`/projects/${input.slug}`, 'layout');
    return {
      ok: report.passed,
      message: `Quality score ${report.score}/100 — ${report.passed ? 'passed' : 'needs attention'}. ${
        report.checks.filter((check) => check.status === 'manual').length
      } check(s) need human eyes.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function buildTimelineAction(slug: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const activeEpisode = await getActiveEpisode(studio, project.id);
    const result = await createTimelineService(studio).build(slug, activeEpisode?.id);
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: `Timeline rebuilt: ${result.items.length} item(s), ${result.totalSeconds}s total, ${result.missingCount} with missing media.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function runExportAction(slug: string, kind: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const result = await createExportService(studio).run({ projectId: project.id, kind: kind as 'project-package' });
    revalidatePath(`/projects/${slug}`, 'layout');
    return {
      ok: true,
      message: `Exported ${result.export.kind}${result.warnings.length > 0 ? ` with ${result.warnings.length} warning(s)` : ''}.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function runPublishAction(slug: string, exportId: string, endpoint: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const record = await createPublishService(studio).publish({ projectId: project.id, exportId, endpoint });
    revalidatePath(`/projects/${slug}/export`);
    return { ok: true, message: record.status === 'completed' ? 'Export delivered.' : 'Delivery is already in progress.' };
  } catch (error) {
    return failure(error);
  }
}

export async function approveExportAction(slug: string, exportId: string, note: string = ''): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const decidedBy = await resolveOperatorIdFromRequest(studio);
    await createPublishService(studio).approveExport(
      project.id,
      { targetType: 'export', targetId: exportId, decision: 'approved', note },
      decidedBy,
    );
    revalidatePath(`/projects/${slug}/export`);
    return { ok: true, message: 'Export approved. You can now publish it.' };
  } catch (error) {
    return failure(error);
  }
}

export async function retryPublishAction(slug: string, publishId: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const service = createPublishService(studio);
    const publish = await service.byId(publishId);
    if (!publish || publish.projectId !== project.id) {
      return { ok: false, message: 'Publish attempt not found for this project.', code: 'NOT_FOUND' };
    }
    await service.retry(publishId);
    revalidatePath(`/projects/${slug}/export`);
    return { ok: true, message: 'Export delivered.' };
  } catch (error) {
    return failure(error);
  }
}

export async function createNodeGraphAction(slug: string, name: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const record = await createNodeGraphService(studio).create(project.id, name);
    revalidatePath(`/projects/${slug}/workflow`);
    return { ok: true, message: `Created workflow "${record.name}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function saveNodeGraphAction(slug: string, graphId: string, graph: unknown): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    await createNodeGraphService(studio).save(project.id, graphId, graph);
    revalidatePath(`/projects/${slug}/workflow`);
    return { ok: true, message: 'Workflow saved.' };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteNodeGraphAction(slug: string, graphId: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    await createNodeGraphService(studio).remove(project.id, graphId);
    revalidatePath(`/projects/${slug}/workflow`);
    return { ok: true, message: 'Workflow deleted.' };
  } catch (error) {
    return failure(error);
  }
}

export async function runWorkflowAction(slug: string, workflowKey: string): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const activeEpisode = await getActiveEpisode(studio, project.id);
    const run = await createWorkflowService(studio).run({
      projectId: project.id,
      episodeId: activeEpisode?.id,
      workflowKey: workflowKey as 'motion-comic',
      autoEnqueueGenerations: true,
    });
    revalidatePath(`/projects/${slug}`, 'layout');
    const failed = run.steps.find((step) => step.status === 'failed');
    const gate = run.steps.find((step) => step.status === 'awaiting-approval');
    return {
      ok: run.status !== 'failed',
      message: failed
        ? `Workflow stopped at "${failed.label}": ${failed.detail}`
        : gate
          ? `Workflow paused at the human gate "${gate.label}".`
          : 'Workflow completed.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function composeVideoAction(
  slug: string,
  resolution: string,
  fps: number,
): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const activeEpisode = await getActiveEpisode(studio, project.id);
    const result = await createComposerService(studio).composeVideo({
      projectId: project.id,
      episodeId: activeEpisode?.id,
      resolution,
      fps,
    });
    revalidatePath(`/projects/${slug}/export`);
    return {
      ok: true,
      message: `Composed video "${result.asset.name}" (${result.export.summary.shots} shots, ${result.asset.durationSeconds}s).`,
      resultUrl: `/api/exports/${result.export.id}?disposition=inline`,
      downloadUrl: `/api/exports/${result.export.id}`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function saveAudioMixAction(slug: string, episodeId: string, mix: AudioMix): Promise<ActionResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const project = await createProjectService(studio).get(slug);
    const episode = await studio.episodes.findById(episodeId);
    if (!episode || episode.projectId !== project.id || mix.episodeId !== episodeId) {
      return { ok: false, message: 'The audio mix does not belong to this project episode.', code: 'VALIDATION_FAILED' };
    }
    await createSoundStudioService(studio).saveMix(mix);
    revalidatePath(`/projects/${slug}/sound`);
    return { ok: true, message: 'Mix saved successfully.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Content-field-only subset of shotInputSchema this action accepts,
 * mirroring scriptService.ts's own private `shotContentUpdateSchema`
 * exactly (the same fields excluded: `sceneId`, `shotNumber`, the pinned
 * `characters`/`location`/`props` references and `continuity`; `status` is
 * never a field of `shotInputSchema` at all) so field-level errors can be
 * built here before the ownership-checked service call, without reaching
 * into scriptService.ts's unexported schema. `visualEffects`/`soundEffects`
 * are contract-authorized but deliberately not exposed by the Shot Editor
 * form (TASK-UI-CORE-EDITORS-001 Shot Editor slice) — they are simply never
 * included in the submitted patch, and ShotRepository.update only writes
 * keys it is given (confirmed by reading production.ts), so omitting them
 * leaves the shot's existing values untouched.
 */
const shotUpdateFormSchema = shotInputSchema.partial().omit({
  sceneId: true,
  shotNumber: true,
  characters: true,
  location: true,
  props: true,
  continuity: true,
});

export async function updateShotAction(
  slug: string,
  sceneId: string,
  shotId: string,
  form: FormData,
): Promise<ActionResult> {
  const raw = {
    title: text(form, 'title'),
    description: text(form, 'description'),
    shotSize: text(form, 'shotSize'),
    cameraAngle: text(form, 'cameraAngle'),
    cameraMovement: { type: text(form, 'cameraMovementType'), speed: text(form, 'cameraMovementSpeed') },
    lens: text(form, 'lens'),
    durationSeconds: Number(form.get('durationSeconds') ?? 0),
    dialogue: text(form, 'dialogue'),
    emotion: text(form, 'emotion'),
    lighting: text(form, 'lighting'),
    aspectRatio: text(form, 'aspectRatio'),
    importance: text(form, 'importance'),
  };
  const parsed = shotUpdateFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Check the highlighted fields.',
      code: 'VALIDATION_FAILED',
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  try {
    const shot = await createScriptService(await getAuthorizedActionStudio()).updateShot(slug, sceneId, shotId, parsed.data);
    revalidatePath(`/projects/${slug}/shots/${encodeURIComponent(shot.code)}/edit`);
    revalidatePath(`/projects/${slug}/shots/${encodeURIComponent(shot.code)}`);
    revalidatePath(`/projects/${slug}/shots`);
    return { ok: true, message: `Saved shot ${shot.code}.` };
  } catch (error) {
    return failure(error);
  }
}

/**
 * VC3 (TASK-UI-VISUAL-CONTROL-001) — controlled repin of one shot-level
 * Character/Location/Prop version pin, through `scriptService.repinShot`.
 * The discriminated union is parsed at the boundary so an unsupported kind
 * (e.g. `style`) or a malformed payload is rejected before the service runs.
 * On success the Visual Control read model is refreshed by revalidating the
 * Shot Inspector and its editor, so stale pin evidence is never retained.
 */
export async function repinReferenceAction(slug: string, shotId: string, form: FormData): Promise<ActionResult> {
  const kind = text(form, 'kind');
  const raw = {
    kind,
    projectIdOrSlug: slug,
    shotId,
    ...(kind === 'character' ? { characterId: text(form, 'characterId') } : {}),
    ...(kind === 'location' ? { locationId: text(form, 'locationId') } : {}),
    ...(kind === 'prop' ? { propId: text(form, 'propId') } : {}),
    versionId: text(form, 'versionId'),
  };
  const parsed = repinReferenceSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Check the repin details.',
      code: 'VALIDATION_FAILED',
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  try {
    const shot = await createScriptService(await getAuthorizedActionStudio()).repinShot(parsed.data);
    revalidatePath(`/projects/${slug}/shots/${encodeURIComponent(shot.code)}`);
    revalidatePath(`/projects/${slug}/shots/${encodeURIComponent(shot.code)}/edit`);
    return { ok: true, message: `Repinned ${parsed.data.kind} to ${parsed.data.versionId} on ${shot.code}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function inspectShotPromptAction(
  slug: string,
  shotId: string,
): Promise<ActionResult & { data?: any }> {
  try {
    const studio = getStudio();
    const project = await createProjectService(studio).get(slug);
    if (!project) return { ok: false, message: 'Project not found' };

    const shot = await studio.shots.byId(shotId);
    if (!shot) return { ok: false, message: 'SHOT_NOT_FOUND' };

    const scene = await studio.scenes.byId(shot.sceneId);
    if (!scene || !scene.episodeId) return { ok: false, message: 'SHOT_NOT_FOUND' };

    const episode = await studio.episodes.findById(scene.episodeId);
    if (!episode || episode.projectId !== project.id) {
      return { ok: false, message: 'SHOT_PROJECT_MISMATCH' };
    }

    const promptService = createPromptService(studio);

    const safeCompile = async (kind: 'image' | 'video') => {
      try {
        const result = await promptService.compilePreview(shotId, kind);
        return {
          compiled: result.compiled,
          negative: result.negative,
          lockRefs: result.lockRefs,
          lint: result.lint,
          version: 0,
          createdAt: new Date().toISOString(),
        };
      } catch (e) {
        return null;
      }
    };

    const [imageData, videoData] = await Promise.all([
      safeCompile('image'),
      safeCompile('video')
    ]);

    const bibles = studio.bibles;
    const characters = await Promise.all(shot.characters.map(async c => {
      const char = await bibles.characterById(c.characterId);
      return { characterId: c.characterId, versionId: c.versionId, name: char?.name };
    }));
    const locationObj = shot.locationId ? await bibles.locationById(shot.locationId) : null;
    const location = shot.locationId ? { locationId: shot.locationId, versionId: shot.locationVersionId ?? '', name: locationObj?.name } : null;

    const props = await Promise.all(shot.props.map(async p => {
      const prop = await bibles.propById(p.propId);
      return { propId: p.propId, versionId: p.versionId, name: prop?.name };
    }));

    const ingredients = {
      characters,
      location,
      props,
      hasProjectStyle: true,
      shotSize: shot.shotSize,
      cameraAngle: shot.cameraAngle,
      cameraMovement: `${shot.cameraMovement.speed} ${shot.cameraMovement.type}`,
      lens: shot.lens,
      durationSeconds: shot.durationSeconds,
      aspectRatio: shot.aspectRatio,
      description: shot.description,
      dialogue: shot.dialogue,
      lighting: shot.lighting,
      emotion: shot.emotion,
    };

    const requiredRefs = {
      hasCharacters: shot.characters.length > 0,
      hasLocation: Boolean(shot.locationId),
      hasProps: shot.props.length > 0,
      hasProjectStyle: true,
    };

    return {
      ok: true,
      message: 'Compiled preview successfully',
      data: { imageData, videoData, ingredients, requiredRefs }
    };
  } catch (error) {
    return failure(error);
  }
}