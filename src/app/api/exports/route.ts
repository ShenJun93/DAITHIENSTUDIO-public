/** Creates an export artefact (project package, EDL, SRT, shot list, voice script). */
import { createExportService } from '@/application/services/exportService';
import { exportRequestSchema } from '@/domain/schemas';
import { getContext, ok, parseBody, requireApiKey, route } from '../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  requireApiKey(request);
  const { studio } = getContext();
  const input = await parseBody(request, exportRequestSchema);
  const result = await createExportService(studio).run(input);
  return ok(result, { status: 201 });
});
