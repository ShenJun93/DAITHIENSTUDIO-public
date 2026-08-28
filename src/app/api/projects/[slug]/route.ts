import { createProjectService } from '@/application/services/projectService';
import { updateProjectSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  return ok({ project: await createProjectService(studio).get(slug) });
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const patch = await parseBody(request, updateProjectSchema);
  return ok({ project: await createProjectService(studio).update(slug, patch) });
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  await createProjectService(studio).softDelete(slug);
  return ok({ deleted: true, slug });
});
