/**
 * Manual asset upload (reference art, plates, hand-painted keyframes).
 * multipart/form-data: `file` plus an optional `metadata` JSON field.
 */
import { createAssetService } from '@/application/services/assetService';
import { DomainError } from '@/domain/errors';
import { MAX_UPLOAD_BYTES } from '@/domain/fileValidation';
import { getContext, ok, requireApiKey, route } from '../../../../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

async function boundedFormData(request: Request): Promise<FormData> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_MULTIPART_BYTES) {
      throw new DomainError('VALIDATION_FAILED', `Multipart request exceeds the ${MAX_MULTIPART_BYTES}-byte limit.`);
    }
  }
  if (!request.body) {
    throw new DomainError('VALIDATION_FAILED', 'Expected multipart/form-data with a `file` field.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new DomainError('VALIDATION_FAILED', `Multipart request exceeds the ${MAX_MULTIPART_BYTES}-byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total),
  });
  return await boundedRequest.formData();
}

interface Params {
  params: Promise<{ slug: string }>;
}

export const POST = route(async (request: Request, { params }: Params) => {
  requireApiKey(request);
  const { slug } = await params;
  const { studio } = getContext();

  const form = await boundedFormData(request).catch((error: unknown) => {
    if (error instanceof DomainError) throw error;
    throw new DomainError('VALIDATION_FAILED', 'Expected multipart/form-data with a `file` field.');
  });

  const file = form.get('file');
  if (!(file instanceof File)) throw new DomainError('VALIDATION_FAILED', 'No `file` field in the upload.');
  if (file.size === 0) throw new DomainError('VALIDATION_FAILED', 'Refusing to store an empty file.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new DomainError('VALIDATION_FAILED', `File is ${file.size} bytes; the limit is ${MAX_UPLOAD_BYTES}.`);
  }

  const rawMetadata = form.get('metadata');
  let metadata: unknown = { kind: 'image', name: file.name };
  if (typeof rawMetadata === 'string' && rawMetadata.trim()) {
    try {
      metadata = JSON.parse(rawMetadata);
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'Metadata must be valid JSON.');
    }
  }

  const asset = await createAssetService(studio).upload(slug, metadata, {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    data: Buffer.from(await file.arrayBuffer()),
  });

  return ok({ asset }, { status: 201 });
});
