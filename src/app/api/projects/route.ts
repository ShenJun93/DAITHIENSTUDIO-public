import { createProjectService } from '@/application/services/projectService';
import { paginationSchema } from '@/domain/schemas';
import { createProductFacingProjectSchema } from '@/domain/productionTypeIdentity';
import { getContext, ok, parseBody, parseQuery, requireApiKey, route } from '../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = route(async (request: Request) => {
  const { studio } = getContext();
  const { limit, offset } = parseQuery(request, paginationSchema);
  return ok({ projects: await createProjectService(studio).list({ limit, offset }), limit, offset });
});

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, createProductFacingProjectSchema);
  const project = await createProjectService(studio).create(input);
  return ok({ project }, { status: 201 });
});
