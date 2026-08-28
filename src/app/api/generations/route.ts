/**
 * Enqueues a generation job. Nothing is generated inline — the job goes onto
 * the queue and `npm run worker` (or `POST /api/projects/[slug]/queue/drain`)
 * executes it.
 */
import { createGenerationService } from '@/application/services/generationService';
import { enqueueGenerationSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, enqueueGenerationSchema);
  const { generation, reused, warnings } = await createGenerationService(studio).enqueue(input);
  return ok({ generation, reused, warnings }, { status: reused ? 200 : 201 });
});
