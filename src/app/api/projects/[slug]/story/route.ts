/**
 * Story Development module (TASK-004).
 *
 * One route, several actions — mirrors the shape of the operator's workflow
 * (generate, regenerate one part, edit, accept, unlock) without a route per verb.
 */
import { z } from 'zod';
import { createStoryService } from '@/application/services/storyService';
import {
  acceptStoryPartsSchema,
  generateStorySchema,
  regenerateStoryPartSchema,
  saveStorySchema,
  unlockStoryPartsSchema,
} from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

const storyActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('generate') }).merge(generateStorySchema),
  z.object({ action: z.literal('regenerate') }).merge(regenerateStoryPartSchema),
  z.object({ action: z.literal('save'), values: saveStorySchema }),
  z.object({ action: z.literal('accept') }).merge(acceptStoryPartsSchema),
  z.object({ action: z.literal('unlock') }).merge(unlockStoryPartsSchema),
]);

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  return ok({ story: await createStoryService(studio).get(slug) });
});

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const story = createStoryService(studio);
  const input = await parseBody(request, storyActionSchema);

  switch (input.action) {
    case 'generate':
      return ok({ story: await story.generate(slug, { premise: input.premise }) });
    case 'regenerate':
      return ok({ story: await story.regeneratePart(slug, { part: input.part, premise: input.premise }) });
    case 'save':
      return ok({ story: await story.save(slug, input.values) });
    case 'accept':
      return ok({ story: await story.accept(slug, { parts: input.parts, values: input.values }) });
    case 'unlock':
      return ok({ story: await story.unlock(slug, { parts: input.parts }) });
  }
});
