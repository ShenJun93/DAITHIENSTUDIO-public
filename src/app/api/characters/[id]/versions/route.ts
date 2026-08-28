/** Every snapshot version ever written for this character, oldest first. */
import { createBibleService } from '@/application/services/bibleService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const { studio } = getContext();
  return ok({ versions: await createBibleService(studio).characterVersions(id) });
});
