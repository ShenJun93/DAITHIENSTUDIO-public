import { createProjectService } from '@/application/services/projectService';
import { getContext, ok, route } from '../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = route(async () => {
  const { studio } = getContext();
  return ok(await createProjectService(studio).dashboard());
});
