/**
 * Serves a stored asset.
 *
 * The storage key is normalised before use, so `..`, an absolute path or a
 * drive letter is rejected rather than sanitised. No filesystem path is ever
 * returned to the client.
 */
import { getContext, route } from '../../_lib/handler';
import { normaliseStorageKey } from '@/domain/storageKey';
import { DomainError } from '@/domain/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIME_BY_EXTENSION: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  json: 'application/json',
  srt: 'application/x-subrip',
  csv: 'text/csv',
  txt: 'text/plain',
  edl: 'text/plain',
};

interface Params {
  params: Promise<{ key: string[] }>;
}

export const GET = route(async (_request: Request, { params }: Params) => {
  const { key } = await params;
  const joined = normaliseStorageKey((key ?? []).map((part) => decodeURIComponent(part)).join('/'));
  const { studio } = getContext();

  if (!(await studio.storage.exists(joined))) {
    throw new DomainError('NOT_FOUND', 'No stored file for that key.');
  }

  const extension = joined.split('.').pop()?.toLowerCase() ?? '';
  const body = await studio.storage.get(joined);

  const headers: Record<string, string> = {
    'Content-Type': MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
    'Content-Length': String(body.byteLength),
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };

  if (extension === 'svg') {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }

  return new Response(new Uint8Array(body), { headers });
});
