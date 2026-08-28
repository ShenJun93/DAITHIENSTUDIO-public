/** Project-wide continuity report, classified per finding. */
import { createContinuityService } from '@/application/services/continuityService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ slug: string }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  return ok(await createContinuityService(getContext().studio).forProject(slug));
});
