/** Records an approval decision. Approval is an event, not a boolean flip. */
import { createAssetService } from '@/application/services/assetService';
import { assetApprovalBodySchema, assetApprovalParamsSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';
import { OPERATOR_HEADER, resolveOperatorId } from '../../../../_lib/operator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ id: string }>;
}

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { id } = assetApprovalParamsSchema.parse(await params);
  const { studio } = getContext();
  const body = await parseBody(request, assetApprovalBodySchema);
  const decidedBy = await resolveOperatorId(studio, request.headers.get(OPERATOR_HEADER));
  const asset = await createAssetService(studio).decide(id, body.decision, body.note, decidedBy);
  return ok({ asset });
});
