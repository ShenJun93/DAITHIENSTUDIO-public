/** Side-by-side diff of two versions of the same prompt. */
import { z } from 'zod';
import { createPromptService } from '@/application/services/promptService';
import { getContext, ok, parseQuery, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const compareQuerySchema = z.object({
  left: z.coerce.number().int().min(1),
  right: z.coerce.number().int().min(1),
});

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const { studio } = getContext();
  const { left, right } = parseQuery(request, compareQuerySchema);
  return ok(await createPromptService(studio).compareVersions(id, left, right));
});
