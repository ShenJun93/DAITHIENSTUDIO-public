/**
 * Local filesystem storage driver.
 *
 * Rules it enforces:
 *  - every write is confined to STORAGE_LOCAL_ROOT; a key that escapes the root
 *    (`..`, absolute path, drive letter) is rejected, not normalised away
 *  - keys are POSIX-style and portable — no Windows absolute path ever reaches
 *    the database, which is the documented Windows upload bug class
 *  - every stored file gets a sha256 checksum so duplicate detection and
 *    lineage verification are possible
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, StoredFile } from '@/application/ports';
import { DomainError } from '@/domain/errors';
import { normaliseStorageKey } from '@/domain/storageKey';

function nodeErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

/** Turns any user-supplied name into a safe single path segment. */
export function safeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || 'file';
}

export class LocalStorageProvider implements StorageProvider {
  readonly driver = 'local';

  constructor(
    private readonly root: string,
    private readonly publicBaseUrl: string,
  ) {}

  private async absolute(key: string): Promise<string> {
    const safeKey = normaliseStorageKey(key);
    const resolvedRoot = path.resolve(this.root);
    const target = path.resolve(resolvedRoot, safeKey);
    if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
      throw new DomainError('STORAGE_FAILED', `Refusing to write outside the storage root: ${key}`);
    }

    await fs.mkdir(resolvedRoot, { recursive: true }).catch(() => {});
    const realRoot = await fs.realpath(resolvedRoot).catch(() => resolvedRoot);
    let current = target;
    let realCurrent = '';

    while (current !== path.dirname(current)) {
      try {
        realCurrent = await fs.realpath(current);
        break;
      } catch (error) {
        if (nodeErrorCode(error) === 'ENOENT') {
          current = path.dirname(current);
        } else {
          throw new DomainError('STORAGE_FAILED', 'Could not safely resolve the requested storage path.');
        }
      }
    }

    if (realCurrent && realCurrent !== realRoot && !realCurrent.startsWith(realRoot + path.sep)) {
      throw new DomainError('STORAGE_FAILED', `Path escapes storage root via symlink: ${key}`);
    }

    return target;
  }

  async put(key: string, data: Buffer | Uint8Array | string, mimeType: string): Promise<StoredFile> {
    const target = await this.absolute(key);
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buffer);
    } catch (error) {
      throw new DomainError('STORAGE_FAILED', `Could not write asset ${normaliseStorageKey(key)}.`);
    }
    return {
      key: normaliseStorageKey(key),
      sizeBytes: buffer.byteLength,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      mimeType,
      url: this.url(key),
    };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(await this.absolute(key));
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('NOT_FOUND', `Asset file not found in storage: ${normaliseStorageKey(key)}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(await this.absolute(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Served by `src/app/api/files/[...key]/route.ts`, never as a raw disk path. */
  url(key: string): string {
    const safeKey = normaliseStorageKey(key);
    const base = this.publicBaseUrl.replace(/\/+$/, '');
    return `${base}/api/files/${safeKey.split('/').map(encodeURIComponent).join('/')}`;
  }

  async localPath(key: string): Promise<string> {
    return this.absolute(key);
  }
}

/** Deterministic, human-navigable key layout (spec §27). */
export function assetKey(input: {
  projectSlug: string;
  episodeCode?: string | null;
  sceneCode?: string | null;
  shotCode?: string | null;
  bucket: 'references' | 'images' | 'videos' | 'audio' | 'exports' | 'bibles' | 'documents';
  fileName: string;
}): string {
  const parts = ['projects', input.projectSlug];
  if (input.episodeCode) parts.push('episodes', input.episodeCode.toLowerCase());
  if (input.sceneCode) parts.push('scenes', input.sceneCode.toLowerCase());
  if (input.shotCode) parts.push('shots', input.shotCode.toLowerCase());
  parts.push(input.bucket, safeFileName(input.fileName));
  return parts.join('/');
}
