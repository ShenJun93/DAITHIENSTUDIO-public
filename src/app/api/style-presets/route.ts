/** The built-in style presets. Static reference data, no project scope. */
import { createBibleService } from '@/application/services/bibleService';
import { getContext, ok, route } from '../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = route(async () => {
  const { studio } = getContext();
  return ok({ presets: createBibleService(studio).presets() });
});
