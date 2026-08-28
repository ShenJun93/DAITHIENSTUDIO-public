/** Dry run of the script parser. Nothing is persisted by this route. */
import { createScriptService } from '@/application/services/scriptService';
import { getContext, ok, route } from '../../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  return ok(await createScriptService(studio).preview(slug));
});
