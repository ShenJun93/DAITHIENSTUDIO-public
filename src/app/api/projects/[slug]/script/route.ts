import { createScriptService } from '@/application/services/scriptService';
import { saveScriptSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  return ok({ script: await createScriptService(studio).getScript(slug) });
});

export const PUT = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const input = await parseBody(request, saveScriptSchema);
  return ok({ script: await createScriptService(studio).saveScript(slug, input) });
});
