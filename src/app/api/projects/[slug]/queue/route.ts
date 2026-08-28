/** Render Queue for a project, optionally filtered by job status. */
import { z } from 'zod';
import { createGenerationService } from '@/application/services/generationService';
import { createProjectService } from '@/application/services/projectService';
import { GENERATION_STATUSES } from '@/domain/enums';
import { getContext, ok, parseQuery, route } from '../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({ status: z.enum(GENERATION_STATUSES).optional() });

interface Params {
  params: Promise<{ slug: string }>;
}

export const GET = route(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const { studio } = getContext();
  const project = await createProjectService(studio).get(slug);
  const { status } = parseQuery(request, querySchema);
  const jobs = await createGenerationService(studio).queue(project.id, status);
  const counts = await studio.generations.countByStatus(project.id);
  return ok({ jobs, counts, spentUsd: await studio.generations.spentUsd(project.id) });
});
