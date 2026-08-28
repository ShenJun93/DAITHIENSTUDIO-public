/**
 * Parses the saved script into scenes.
 *
 * Re-parsing a project that already has scenes would discard them, so the
 * service raises `CONFLICT`. That surfaces here as 409 with the existing scene
 * count in `details`, which is what lets the UI ask "replace 12 scenes?" before
 * retrying with `replaceExisting: true`.
 */
import { z } from 'zod';
import { createScriptService } from '@/application/services/scriptService';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const parseScriptRequestSchema = z.object({ replaceExisting: z.boolean().default(false) });

type Params = { params: Promise<{ slug: string }> };

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const { replaceExisting } = await parseBody(request, parseScriptRequestSchema);
  return ok(await createScriptService(studio).parseIntoScenes(slug, { replaceExisting }));
});
