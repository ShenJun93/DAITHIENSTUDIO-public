import { createBibleService } from '@/application/services/bibleService';
import { locationInputSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  return ok({ locations: await createBibleService(studio).listLocations(slug) });
});

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const input = await parseBody(request, locationInputSchema);
  return ok({ location: await createBibleService(studio).createLocation(slug, input) }, { status: 201 });
});
