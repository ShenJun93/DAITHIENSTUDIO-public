/** Quality reports recorded for this project. */
import { createQualityService } from '@/application/services/qualityService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ slug: string }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  return ok({ reports: await createQualityService(getContext().studio).listForProject(slug) });
});
