/** Seeds a Style Bible entry from one of the built-in presets. */
import { z } from 'zod';
import { createBibleService } from '@/application/services/bibleService';
import { nonEmpty } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fromPresetSchema = z.object({ presetKey: nonEmpty.max(120) });

type Params = { params: Promise<{ slug: string }> };

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const { presetKey } = await parseBody(request, fromPresetSchema);
  return ok({ style: await createBibleService(studio).addStyleFromPreset(slug, presetKey) }, { status: 201 });
});
