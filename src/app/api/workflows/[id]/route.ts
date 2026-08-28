/** One workflow run, including per-step status and detail. */
import { createWorkflowService } from '@/application/services/workflowService';
import { getContext, ok, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ id: string }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  return ok({ run: await createWorkflowService(getContext().studio).byId(id) });
});
