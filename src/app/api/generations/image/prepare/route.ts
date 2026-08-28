import { createGenerationService } from '@/application/services/generationService';
import { prepareImageGenerationSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, prepareImageGenerationSchema);
  const prepared = await createGenerationService(studio).prepareImage(input);
  return ok(prepared);
});
