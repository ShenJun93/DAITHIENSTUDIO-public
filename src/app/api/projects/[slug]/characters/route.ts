import { createBibleService } from '@/application/services/bibleService';
import { characterInputSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  return ok({ characters: await createBibleService(studio).listCharacters(slug) });
});

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const input = await parseBody(request, characterInputSchema);
  return ok({ character: await createBibleService(studio).createCharacter(slug, input) }, { status: 201 });
});
