/** Current timeline. Built on first read if it does not exist yet. */
import { createTimelineService } from '@/application/services/timelineService';
import { getContext, ok, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ slug: string }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  return ok({ timeline: await createTimelineService(getContext().studio).current(slug) });
});
