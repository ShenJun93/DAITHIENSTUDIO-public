/**
 * Storyboard reorder (TASK-005). Scoped to one scene at a time — shots don't
 * move between scenes here, only their display order within a scene changes.
 * A shot's code and shotNumber are never touched.
 */
import { notFound } from '@/domain/errors';
import { reorderShotsSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();

  const project = (await studio.projects.byId(slug)) ?? (await studio.projects.bySlug(slug));
  if (!project) throw notFound('Project', slug);

  const input = await parseBody(request, reorderShotsSchema);
  const scene = await studio.scenes.byId(input.sceneId);
  if (!scene || scene.projectId !== project.id) throw notFound('Scene', input.sceneId);

  return ok({ shots: await studio.shots.reorder(input.sceneId, input.shotIds) });
});
