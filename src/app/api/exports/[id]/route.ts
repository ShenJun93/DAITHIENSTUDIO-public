/** Downloads a previously produced export with the right content type. */
import { createExportService } from '@/application/services/exportService';
import { exportDownloadQuerySchema } from '@/domain/schemas';
import { getContext, route } from '../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, { mime: string; extension: string }> = {
  'project-package': { mime: 'application/json', extension: 'json' },
  edl: { mime: 'text/plain; charset=utf-8', extension: 'edl' },
  srt: { mime: 'application/x-subrip; charset=utf-8', extension: 'srt' },
  'shot-list': { mime: 'text/csv; charset=utf-8', extension: 'csv' },
  'voice-script': { mime: 'text/plain; charset=utf-8', extension: 'txt' },
  video: { mime: 'video/mp4', extension: 'mp4' },
};

interface Params {
  params: Promise<{ id: string }>;
}

export const GET = route(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const query = exportDownloadQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  const { record, body } = await createExportService(getContext().studio).readBytes(id);
  const type = CONTENT_TYPES[record.kind] ?? { mime: 'application/octet-stream', extension: 'bin' };
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': type.mime,
      'Content-Disposition': `${query.disposition}; filename="${record.kind}-${record.id}.${type.extension}"`,
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
