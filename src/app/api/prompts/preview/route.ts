/** Live preview for Prompt Studio. Compiles and lints without persisting anything. */
import { createPromptService } from '@/application/services/promptService';
import { buildPromptSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, buildPromptSchema);
  return ok(await createPromptService(studio).compilePreview(input.shotId, input.kind ?? 'image', input.blocks));
});
