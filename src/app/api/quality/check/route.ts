/** Runs the QC checklist for one asset and stores the report. */
import { createQualityService } from '@/application/services/qualityService';
import { assetQualityRequestSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const { assetId } = await parseBody(request, assetQualityRequestSchema);
  return ok({ report: await createQualityService(studio).checkAsset(assetId) });
});
