/**
 * Best-effort metadata probing for manually uploaded media (TASK-REFINE-003).
 *
 * Provider-generated assets already carry width/height/durationSeconds from
 * the provider's own artifact metadata; only the manual Upload path lacked
 * this. Probing is optional enrichment: any failure (missing ffprobe,
 * malformed output, timeout, unsupported type) resolves to `null` rather
 * than rejecting, so an upload is never blocked by a probe that could not
 * run.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);
const AUDIO_MIME_TYPES = new Set(['audio/wav', 'audio/mpeg']);

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.freeze({
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
});

const ffprobeResultSchema = z
  .object({
    streams: z
      .array(
        z
          .object({
            codec_type: z.string(),
            width: z.number().int().positive().optional(),
            height: z.number().int().positive().optional(),
          })
          .passthrough(),
      )
      .default([]),
    format: z.object({ duration: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export interface ProbedMediaMetadata {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface MediaMetadataProbe {
  /** Resolves to `null` when the type is unsupported or probing fails for any reason. */
  probe(data: Buffer, mimeType: string): Promise<ProbedMediaMetadata | null>;
}

export interface MediaMetadataProbeOptions {
  ffprobePath?: string;
  timeoutMs?: number;
}

async function probeImage(data: Buffer): Promise<ProbedMediaMetadata | null> {
  try {
    const metadata = await sharp(data).metadata();
    const width = metadata.width && metadata.width > 0 ? metadata.width : null;
    const height = metadata.height && metadata.height > 0 ? metadata.height : null;
    if (width === null && height === null) return null;
    return { width, height, durationSeconds: null };
  } catch {
    return null;
  }
}

async function probeWithFfprobe(
  data: Buffer,
  mimeType: string,
  kind: 'video' | 'audio',
  options: Required<MediaMetadataProbeOptions>,
): Promise<ProbedMediaMetadata | null> {
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin';
  let tempDir: string | null = null;
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'media-probe-'));
    const tempPath = join(tempDir, `${randomUUID()}.${extension}`);
    await writeFile(tempPath, data);

    const { stdout } = await execFileAsync(
      options.ffprobePath,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', tempPath],
      { timeout: options.timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );

    const parsed = ffprobeResultSchema.safeParse(JSON.parse(stdout));
    if (!parsed.success) return null;

    let width: number | null = null;
    let height: number | null = null;
    if (kind === 'video') {
      const videoStream = parsed.data.streams.find((stream) => stream.codec_type === 'video');
      width = videoStream?.width ?? null;
      height = videoStream?.height ?? null;
    }

    const durationRaw = Number(parsed.data.format?.duration);
    const durationSeconds = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null;

    if (width === null && height === null && durationSeconds === null) return null;
    return { width, height, durationSeconds };
  } catch {
    // Missing executable (ENOENT), timeout, malformed output, or a corrupt
    // file that ffprobe rejects — all fall back to "unknown", never to a
    // fabricated 0.
    return null;
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function createMediaMetadataProbe(options: MediaMetadataProbeOptions = {}): MediaMetadataProbe {
  const resolved: Required<MediaMetadataProbeOptions> = {
    ffprobePath: options.ffprobePath ?? 'ffprobe',
    timeoutMs: options.timeoutMs ?? 10_000,
  };

  return {
    async probe(data, mimeType) {
      if (data.byteLength === 0) return null;
      const normalized = mimeType.toLowerCase();

      if (IMAGE_MIME_TYPES.has(normalized)) return probeImage(data);
      if (VIDEO_MIME_TYPES.has(normalized)) return probeWithFfprobe(data, normalized, 'video', resolved);
      if (AUDIO_MIME_TYPES.has(normalized)) return probeWithFfprobe(data, normalized, 'audio', resolved);

      return null;
    },
  };
}
