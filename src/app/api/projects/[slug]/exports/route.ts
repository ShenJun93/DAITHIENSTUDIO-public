/** Export history for this project. */
import { createExportService } from '@/application/services/exportService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ slug: string }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  return ok({ exports: await createExportService(getContext().studio).list(slug) });
});
