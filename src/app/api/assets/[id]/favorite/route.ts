/** Toggles the favourite flag used by the Asset Library filters. */
import { z } from 'zod';
import { createAssetService } from '@/application/services/assetService';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({ favorite: z.boolean().default(true) });

interface Params {
  params: Promise<{ id: string }>;
}

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { id } = await params;
  const { studio } = getContext();
  const body = await parseBody(request, bodySchema);
  return ok({ asset: await createAssetService(studio).setFavorite(id, body.favorite) });
});
