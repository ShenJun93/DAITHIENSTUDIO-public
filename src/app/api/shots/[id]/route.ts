/**
 * A single shot, with the prompts and generations that belong to it — the shot
 * page needs all three in one request.
 *
 * GET reads the `shots` repository port on `Studio` directly, matching every
 * other read-only route in this app. PATCH goes through
 * `scriptService.updateShot` (TASK-SCENE-SHOT-EDIT-SERVICES-001), which owns
 * project/scene ownership and content-field validation — it never accepts a
 * direct repository write from this route.
 */
import { z } from 'zod';
import { createGenerationService } from '@/application/services/generationService';
import { createPromptService } from '@/application/services/promptService';
import { createScriptService } from '@/application/services/scriptService';
import { notFound } from '@/domain/errors';
import { nonEmpty, updateShotSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, parseQuery, requireApiKey, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * Optional ownership assertion: a caller that already knows its own
 * project/scene context (the shape a future Shot Editor UI will have) can
 * assert it here for a real cross-project/cross-scene check. Omitting them —
 * every caller today, since this route has zero UI callers — still runs the
 * same service-level ownership check, just against the shot's own resolved
 * project/scene instead of a caller-asserted one.
 */
const ownershipQuerySchema = z.object({ project: nonEmpty.optional(), scene: nonEmpty.optional() });

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const { studio } = getContext();

  const shot = await studio.shots.byId(id);
  if (!shot) throw notFound('Shot', id);

  const [prompts, generations] = await Promise.all([
    createPromptService(studio).listForShot(shot.id),
    createGenerationService(studio).listForShot(shot.id),
  ]);

  return ok({ shot, prompts, generations });
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { id } = await params;
  const { studio } = getContext();

  const current = await studio.shots.byId(id);
  if (!current) throw notFound('Shot', id);

  const { project, scene } = parseQuery(request, ownershipQuerySchema);
  const patch = await parseBody(request, updateShotSchema);

  const shot = await createScriptService(studio).updateShot(
    project ?? current.projectId,
    scene ?? current.sceneId,
    id,
    patch,
  );
  return ok({ shot });
});
