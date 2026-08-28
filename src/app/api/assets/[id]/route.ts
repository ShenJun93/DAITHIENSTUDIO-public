/** Single asset: read and soft delete. Approved assets cannot be deleted. */
import { createAssetService } from '@/application/services/assetService';
import { getContext, ok, requireApiKey, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ id: string }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const { studio } = getContext();
  const service = createAssetService(studio);
  const asset = await service.byId(id);
  return ok({ asset, url: studio.storage.url(asset.storageKey) });
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { id } = await params;
  const { studio } = getContext();
  await createAssetService(studio).softDelete(id);
  return ok({ deleted: id });
});
