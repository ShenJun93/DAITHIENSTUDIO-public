import { createGenerationService } from '@/application/services/generationService';
import { confirmVideoGenerationSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, confirmVideoGenerationSchema);
  const result = await createGenerationService(studio).confirmVideo(input);
  return ok(result, { status: result.reused ? 200 : 201 });
});