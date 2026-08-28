import { z } from 'zod';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../../api/_lib/handler';
import { createProductionTypeAssignmentService } from '@/application/services/productionTypeAssignmentService';
import { productionTypeSchema } from '@/domain/productionTypeIdentity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const patchSchema = z.object({
  productionType: productionTypeSchema.nullable(),
  confirmExistingProductionData: z.boolean().optional(),
});

export const PATCH = route(async (request: Request, context: { params: Promise<{ slug: string }> }) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, patchSchema);
  const { slug } = await context.params;

  const result = await createProductionTypeAssignmentService(studio).change(slug, input);

  return ok(result);
});
