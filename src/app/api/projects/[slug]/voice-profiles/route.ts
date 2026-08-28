/** Voice Studio (TASK-006). Voice profiles are plain records — no bible versioning. */
import { createBibleService } from '@/application/services/bibleService';
import { createVoiceProfileSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  return ok({ voiceProfiles: await createBibleService(studio).listVoiceProfiles(slug) });
});

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();
  const input = await parseBody(request, createVoiceProfileSchema);
  return ok({ voiceProfile: await createBibleService(studio).createVoiceProfile(slug, input) }, { status: 201 });
});
