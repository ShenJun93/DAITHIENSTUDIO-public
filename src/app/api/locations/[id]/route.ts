import { createBibleService } from '@/application/services/bibleService';
import { locationInputSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { id } = await params;
  const { studio } = getContext();
  const patch = await parseBody(request, locationInputSchema.partial());
  return ok({ location: await createBibleService(studio).updateLocation(id, patch) });
});
