import { createProjectService } from '@/application/services/projectService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  const project = await createProjectService(studio).requireProject(slug);
  return ok({ shots: await studio.shots.listByProject(project.id) });
});
