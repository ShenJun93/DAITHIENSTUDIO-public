import { createGenerationService } from '@/application/services/generationService';
import { getContext, ok, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const { studio } = getContext();
  return ok(await createGenerationService(studio).byId(id));
});
