/** Cancels a job. A job already in a terminal state raises JOB_NOT_CANCELLABLE (409). */
import { createGenerationService } from '@/application/services/generationService';
import { getContext, ok, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { id } = await params;
  const { studio } = getContext();
  return ok({ generation: await createGenerationService(studio).cancel(id) });
});
