/** Continuity report narrowed to one shot — the pre-generation gate. */
import { createContinuityService } from '@/application/services/continuityService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const { studio } = getContext();
  return ok(await createContinuityService(studio).forShot(id));
});
