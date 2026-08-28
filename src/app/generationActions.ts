'use server';

import { revalidatePath } from 'next/cache';
import { z, ZodError } from 'zod';
import { getAuthorizedActionStudio } from '@/app/_lib/actionAuth';
import { createProjectService } from '@/application/services/projectService';
import { createGenerationControlService } from '@/application/services/generationControlService';
import { createGenerationService } from '@/application/services/generationService';
import { DomainError, isDomainError } from '@/domain/errors';
import {
  confirmImageGenerationSchema,
  confirmVideoGenerationSchema,
  prepareImageGenerationSchema,
  prepareVideoGenerationSchema,
} from '@/domain/schemas';

export interface GenerationControlActionResult {
  ok: boolean;
  message: string;
  code?: string;
}

interface ActionFailure {
  ok: false;
  message: string;
  code?: string;
}

type GenerationService = ReturnType<typeof createGenerationService>;
type PreparedImageData = Awaited<ReturnType<GenerationService['prepareImage']>>;
type ConfirmedImageData = Awaited<ReturnType<GenerationService['confirmImage']>>;
type PreparedVideoData = Awaited<ReturnType<GenerationService['prepareVideo']>>;
type ConfirmedVideoData = Awaited<ReturnType<GenerationService['confirmVideo']>>;

type ImageGenerationActionResult<T> =
  | { ok: true; message: string; data: T }
  | ActionFailure;

type VideoGenerationActionResult<T> =
  | { ok: true; message: string; data: T }
  | ActionFailure;

const mutationSlugSchema = z.string().trim().min(1).max(200);

const generationControlActionInputSchema = z.object({
  slug: mutationSlugSchema,
  generationId: z.string().trim().min(1).max(160),
});

const prepareImageActionInputSchema = z.object({
  slug: mutationSlugSchema,
  request: prepareImageGenerationSchema,
});

const confirmImageActionInputSchema = z.object({
  slug: mutationSlugSchema,
  confirmation: confirmImageGenerationSchema,
});

const prepareVideoActionInputSchema = z.object({
  slug: mutationSlugSchema,
  request: prepareVideoGenerationSchema,
});

const confirmVideoActionInputSchema = z.object({
  slug: mutationSlugSchema,
  confirmation: confirmVideoGenerationSchema,
});

function failure(error: unknown): ActionFailure {
  if (isDomainError(error)) return { ok: false, message: error.message, code: error.code };
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return {
      ok: false,
      message: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Validation failed',
      code: 'VALIDATION_FAILED',
    };
  }
  console.error('[generation-control-action] unexpected error', error);
  return { ok: false, message: 'Something went wrong. Check the server log.', code: 'INTERNAL' };
}

async function resolveOwnedGeneration(slug: string, generationId: string) {
  // Authorization is intentionally the first trust boundary.
  const studio = await getAuthorizedActionStudio();
  const input = generationControlActionInputSchema.parse({ slug, generationId });
  const project = await createProjectService(studio).get(input.slug);
  const generation = await studio.generations.byId(input.generationId);
  if (!generation || generation.projectId !== project.id) {
    throw new DomainError('NOT_FOUND', 'Generation not found in this project.');
  }
  if (generation.shotId) {
    const shot = await studio.shots.byId(generation.shotId);
    if (!shot || shot.projectId !== project.id) {
      throw new DomainError('NOT_FOUND', 'Generation shot not found in this project.');
    }
  }
  return { studio, input, generation };
}

async function resolveOwnedPrepareImage(slug: string, raw: unknown) {
  // Authorization is deliberately the first trust boundary.
  const studio = await getAuthorizedActionStudio();
  const input = prepareImageActionInputSchema.parse({ slug, request: raw });
  const project = await createProjectService(studio).get(input.slug);

  if (input.request.projectId !== project.id) {
    throw new DomainError(
      'NOT_FOUND',
      'Image generation request not found in this project.',
    );
  }

  return { studio, input };
}

async function resolveOwnedConfirmImage(slug: string, raw: unknown) {
  // Authorization is deliberately the first trust boundary.
  const studio = await getAuthorizedActionStudio();
  const input = confirmImageActionInputSchema.parse({
    slug,
    confirmation: raw,
  });
  const project = await createProjectService(studio).get(input.slug);

  if (input.confirmation.request.projectId !== project.id) {
    throw new DomainError(
      'NOT_FOUND',
      'Image generation request not found in this project.',
    );
  }

  return { studio, input };
}

export async function prepareImageGenerationAction(
  slug: string,
  raw: unknown,
): Promise<ImageGenerationActionResult<PreparedImageData>> {
  try {
    const { studio, input } = await resolveOwnedPrepareImage(slug, raw);
    const data = await createGenerationService(studio).prepareImage(
      input.request,
    );

    return {
      ok: true,
      message: 'Image candidate prepared for confirmation.',
      data,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmImageGenerationAction(
  slug: string,
  raw: unknown,
): Promise<ImageGenerationActionResult<ConfirmedImageData>> {
  try {
    const { studio, input } = await resolveOwnedConfirmImage(slug, raw);
    const data = await createGenerationService(studio).confirmImage(
      input.confirmation,
    );

    revalidatePath(`/projects/${input.slug}`, 'layout');

    return {
      ok: true,
      message: data.reused
        ? 'Existing image generation reused.'
        : 'Image generation queued.',
      data,
    };
  } catch (error) {
    return failure(error);
  }
}

async function resolveOwnedPrepareVideo(slug: string, raw: unknown) {
  // Authorization is deliberately the first trust boundary.
  const studio = await getAuthorizedActionStudio();
  const input = prepareVideoActionInputSchema.parse({ slug, request: raw });
  const project = await createProjectService(studio).get(input.slug);

  if (input.request.projectId !== project.id) {
    throw new DomainError(
      'NOT_FOUND',
      'Video generation request not found in this project.',
    );
  }

  return { studio, input };
}

async function resolveOwnedConfirmVideo(slug: string, raw: unknown) {
  // Authorization is deliberately the first trust boundary.
  const studio = await getAuthorizedActionStudio();
  const input = confirmVideoActionInputSchema.parse({
    slug,
    confirmation: raw,
  });
  const project = await createProjectService(studio).get(input.slug);

  if (input.confirmation.request.projectId !== project.id) {
    throw new DomainError(
      'NOT_FOUND',
      'Video generation request not found in this project.',
    );
  }

  return { studio, input };
}

export async function prepareVideoGenerationAction(
  slug: string,
  raw: unknown,
): Promise<VideoGenerationActionResult<PreparedVideoData>> {
  try {
    const { studio, input } = await resolveOwnedPrepareVideo(slug, raw);
    const data = await createGenerationService(studio).prepareVideo(
      input.request,
    );

    return {
      ok: true,
      message: 'Video candidate prepared for confirmation.',
      data,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmVideoGenerationAction(
  slug: string,
  raw: unknown,
): Promise<VideoGenerationActionResult<ConfirmedVideoData>> {
  try {
    const { studio, input } = await resolveOwnedConfirmVideo(slug, raw);
    const data = await createGenerationService(studio).confirmVideo(
      input.confirmation,
    );

    revalidatePath(`/projects/${input.slug}`, 'layout');

    return {
      ok: true,
      message: data.reused
        ? 'Existing video generation reused.'
        : 'Video generation queued.',
      data,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function retryFailedGenerationAction(
  slug: string,
  generationId: string,
): Promise<GenerationControlActionResult> {
  try {
    const { studio, input } = await resolveOwnedGeneration(slug, generationId);
    const retried = await createGenerationControlService(studio).retryFailed(input.generationId);
    revalidatePath(`/projects/${input.slug}`, 'layout');
    return { ok: true, message: `Retry queued as ${retried.id}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelPendingGenerationAction(
  slug: string,
  generationId: string,
): Promise<GenerationControlActionResult> {
  try {
    const { studio, input } = await resolveOwnedGeneration(slug, generationId);
    await createGenerationControlService(studio).cancelPending(input.generationId);
    revalidatePath(`/projects/${input.slug}`, 'layout');
    return { ok: true, message: 'Queued generation cancelled.' };
  } catch (error) {
    return failure(error);
  }
}
