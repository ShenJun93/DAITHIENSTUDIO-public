/** Asset Library listing, filterable the same way the UI filters. */
import { z } from 'zod';
import { createAssetService } from '@/application/services/assetService';
import { ASSET_KINDS, APPROVAL_STATES } from '@/domain/enums';
import { getContext, ok, parseQuery, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const filterSchema = z.object({
  kind: z.enum(ASSET_KINDS).optional(),
  shotId: z.string().optional(),
  approvalState: z.enum(APPROVAL_STATES).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

interface Params {
  params: Promise<{ slug: string }>;
}

export const GET = route(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  const filter = parseQuery(request, filterSchema);
  const assets = await createAssetService(studio).list(slug, filter);
  return ok({ assets, count: assets.length });
});
