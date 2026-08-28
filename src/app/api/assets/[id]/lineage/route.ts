/**
 * Asset lineage: video ← keyframe ← prompt version ← shot ← bible snapshots.
 * The printable `trail` is what the UI renders; `lineage` is the full graph.
 */
import { createAssetService } from '@/application/services/assetService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ id: string }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const service = createAssetService(getContext().studio);
  const [lineage, trail] = await Promise.all([service.lineage(id), service.lineageTrail(id)]);
  return ok({ lineage, trail });
});
