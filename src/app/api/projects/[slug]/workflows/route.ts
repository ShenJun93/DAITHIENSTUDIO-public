/** Workflow run history for a project. */
import { createWorkflowService } from '@/application/services/workflowService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ slug: string }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  return ok({ runs: await createWorkflowService(getContext().studio).list(slug) });
});
