import { createBibleService } from '@/application/services/bibleService';
import { propInputSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  return ok({ props: await createBibleService(studio).listProps(slug) });
});

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const input = await parseBody(request, propInputSchema);
  return ok({ prop: await createBibleService(studio).createProp(slug, input) }, { status: 201 });
});
