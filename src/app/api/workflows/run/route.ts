/** Runs a named workflow. Human gates pause the run rather than faking success. */
import { createWorkflowService } from '@/application/services/workflowService';
import { runWorkflowSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, runWorkflowSchema);
  return ok({ run: await createWorkflowService(studio).run(input) }, { status: 201 });
});
