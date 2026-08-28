/**
 * Processes pending jobs inline.
 *
 * A single-operator local install should not need a second terminal just to see
 * a keyframe appear, so the UI can drain the queue on demand. `npm run worker`
 * is still the real worker for long sessions and for paid providers.
 */
import { z } from 'zod';
import { createProjectService } from '@/application/services/projectService';
import { createWorker } from '@/infrastructure/queue/worker';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({ limit: z.number().int().min(1).max(100).default(20) });

interface Params {
  params: Promise<{ slug: string }>;
}

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  await createProjectService(studio).get(slug);
  const body = await parseBody(request, bodySchema);
  const processed = await createWorker(studio, { workerId: 'api-drain' }).drain(body.limit);
  return ok({ processed });
});
