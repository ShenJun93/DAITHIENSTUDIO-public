import { createGenerationService } from '@/application/services/generationService';
import { prepareVideoGenerationSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, prepareVideoGenerationSchema);
  const prepared = await createGenerationService(studio).prepareVideo(input);
  return ok(prepared);
});