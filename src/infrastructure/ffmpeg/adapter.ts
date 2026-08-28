import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { stat, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { DomainError } from '@/domain/errors';
import type { ConcatenateVideosInput, MediaAdapter } from '@/application/ports';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_PROCESS_OUTPUT_BYTES = 4 * 1024 * 1024;
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-wav',
]);

const ffprobeResultSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      avg_frame_rate: z.string().optional(),
      r_frame_rate: z.string().optional(),
    }).passthrough(),
  ),
  format: z.object({ duration: z.string().optional() }).passthrough().optional(),
}).passthrough();

export interface MediaProcessResult {
  stdout: string;
  stderr: string;
}

export interface MediaProcessOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

export type MediaProcessRunner = (
  executable: string,
  args: readonly string[],
  options: MediaProcessOptions,
) => Promise<MediaProcessResult>;

export interface FFmpegAdapterOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  timeoutMs?: number;
  tempDirectory?: string;
  runProcess?: MediaProcessRunner;
}

const defaultProcessRunner: MediaProcessRunner = async (executable, args, options) => {
  const result = await execFileAsync(executable, [...args], {
    timeout: options.timeoutMs,
    signal: options.signal,
    windowsHide: true,
    maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
  });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
};

function processError(error: unknown, signal: AbortSignal | undefined, action: string): DomainError {
  if (error instanceof DomainError) return error;
  const value = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  if (signal?.aborted || value.name === 'AbortError' || value.code === 'ABORT_ERR') {
    return new DomainError('MEDIA_CANCELLED', `Media ${action} was cancelled.`);
  }
  if (value.code === 'ETIMEDOUT' || value.killed === true) {
    return new DomainError('MEDIA_TIMEOUT', `Media ${action} exceeded the configured time limit.`);
  }
  return new DomainError('MEDIA_FAILED', `Media ${action} failed.`);
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DomainError('MEDIA_CANCELLED', 'Media composition was cancelled.');
  }
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [numeratorText, denominatorText = '1'] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) && result > 0 ? result : null;
}

function safeConcatPath(path: string): string {
  if (/[\r\n\0]/.test(path)) {
    throw new DomainError('VALIDATION_FAILED', 'Media paths must not contain control characters.');
  }
  return path.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  try {
    const details = await stat(path);
    if (!details.isFile()) throw new Error('not a file');
  } catch {
    throw new DomainError('NOT_FOUND', `${label} file is missing.`);
  }
}

function validateMimeTypes(input: ConcatenateVideosInput): void {
  for (const video of input.videos) {
    const mimeType = video.mimeType.toLowerCase();
    const sourceKind = video.sourceKind ?? (IMAGE_MIME_TYPES.has(mimeType) ? 'image' : 'video');
    const supported = sourceKind === 'image' ? IMAGE_MIME_TYPES.has(mimeType) : VIDEO_MIME_TYPES.has(mimeType);
    if (!supported) {
      throw new DomainError('UNSUPPORTED_CAPABILITY', `Composer does not support ${sourceKind} MIME type ${video.mimeType}.`);
    }
    if (
      sourceKind === 'image' &&
      (video.durationSeconds === undefined ||
        !Number.isFinite(video.durationSeconds) ||
        video.durationSeconds <= 0 ||
        video.durationSeconds > 600)
    ) {
      throw new DomainError('VALIDATION_FAILED', 'Storyboard image duration must be greater than zero and at most 600 seconds.');
    }
  }
  for (const audio of input.audioTracks ?? []) {
    if (!AUDIO_MIME_TYPES.has(audio.mimeType.toLowerCase())) {
      throw new DomainError('UNSUPPORTED_CAPABILITY', `Composer does not support audio MIME type ${audio.mimeType}.`);
    }
  }
}

export function createFFmpegAdapter(options: FFmpegAdapterOptions = {}): MediaAdapter {
  const runProcess = options.runProcess ?? defaultProcessRunner;
  const ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
  const ffprobePath = options.ffprobePath ?? 'ffprobe';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tempDirectory = options.tempDirectory ?? tmpdir();

  async function probe(path: string, label: string, signal?: AbortSignal) {
    throwIfCancelled(signal);
    let result: MediaProcessResult;
    try {
      result = await runProcess(
        ffprobePath,
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path],
        { timeoutMs, signal },
      );
    } catch (error) {
      throw processError(error, signal, `inspection of ${label}`);
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(result.stdout);
    } catch {
      throw new DomainError('VALIDATION_FAILED', `${label} has malformed media metadata.`);
    }
    const parsed = ffprobeResultSchema.safeParse(decoded);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', `${label} has malformed media metadata.`);
    }
    return parsed.data;
  }

  return {
    async isAvailable() {
      try {
        await runProcess(ffmpegPath, ['-version'], { timeoutMs });
        await runProcess(ffprobePath, ['-version'], { timeoutMs });
        return true;
      } catch {
        return false;
      }
    },

    async concatenateVideos(input) {
      const { videos, audioTracks = [], fps = 24, resolution = '1920x1080', signal } = input;
      if (videos.length === 0) {
        throw new DomainError('VALIDATION_FAILED', 'Cannot concatenate zero videos.');
      }
      const resolutionMatch = /^(\d{3,5})x(\d{3,5})$/.exec(resolution);
      if (!resolutionMatch || !Number.isInteger(fps) || fps < 1 || fps > 120) {
        throw new DomainError('VALIDATION_FAILED', 'Composer resolution or FPS is invalid.');
      }
      const expectedWidth = Number(resolutionMatch[1]);
      const expectedHeight = Number(resolutionMatch[2]);
      validateMimeTypes(input);
      throwIfCancelled(signal);

      for (const [index, video] of videos.entries()) {
        await assertRegularFile(video.path, `Video input ${index + 1}`);
        const metadata = await probe(video.path, `Video input ${index + 1}`, signal);
        if (!metadata.streams.some((stream) => stream.codec_type === 'video')) {
          throw new DomainError('VALIDATION_FAILED', `Video input ${index + 1} contains no video stream.`);
        }
      }
      for (const [index, audio] of audioTracks.entries()) {
        await assertRegularFile(audio.path, `Audio input ${index + 1}`);
        const metadata = await probe(audio.path, `Audio input ${index + 1}`, signal);
        if (!metadata.streams.some((stream) => stream.codec_type === 'audio')) {
          throw new DomainError('VALIDATION_FAILED', `Audio input ${index + 1} contains no audio stream.`);
        }
      }
      const listFilePath = join(tempDirectory, `concat-list-${randomUUID()}.txt`);
      const tempOutputPath = join(tempDirectory, `compose-${randomUUID()}.mp4`);
      const motionClipPaths: string[] = [];

      try {
        const preparedPaths: string[] = [];
        for (const video of videos) {
          const sourceKind = video.sourceKind ?? (IMAGE_MIME_TYPES.has(video.mimeType.toLowerCase()) ? 'image' : 'video');
          if (sourceKind === 'video') {
            preparedPaths.push(video.path);
            continue;
          }

          const motionClipPath = join(tempDirectory, `motion-${randomUUID()}.mp4`);
          motionClipPaths.push(motionClipPath);
          const filter = [
            `scale=${expectedWidth}:${expectedHeight}:force_original_aspect_ratio=increase`,
            `crop=${expectedWidth}:${expectedHeight}`,
            `zoompan=z='min(zoom+0.0008,1.08)':d=1:s=${expectedWidth}x${expectedHeight}:fps=${fps}`,
            'format=yuv420p',
          ].join(',');
          try {
            await runProcess(ffmpegPath, [
              '-y', '-loop', '1', '-i', video.path,
              '-t', String(video.durationSeconds),
              '-vf', filter,
              '-an', '-c:v', 'libx264', '-r', String(fps), '-pix_fmt', 'yuv420p',
              motionClipPath,
            ], { timeoutMs, signal });
          } catch (error) {
            throw processError(error, signal, 'storyboard motion preparation');
          }
          preparedPaths.push(motionClipPath);
        }

        const listContent = preparedPaths.map((path) => `file '${safeConcatPath(path)}'`).join('\n');
        await writeFile(listFilePath, listContent, 'utf8');

        const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listFilePath];
        for (const track of audioTracks) args.push('-i', track.path);
        args.push(
          '-map', '0:v:0',
          '-c:v', 'libx264',
          '-r', String(fps),
          '-vf', `scale=${expectedWidth}:${expectedHeight}:force_original_aspect_ratio=decrease,pad=${expectedWidth}:${expectedHeight}:(ow-iw)/2:(oh-ih)/2`,
          '-pix_fmt', 'yuv420p',
        );

        if (audioTracks.length > 0) {
          let filterComplex = '';
          let mixInputs = '';
          audioTracks.forEach((track, index) => {
            const inputIndex = index + 1;
            const delayMs = Math.round(track.startTimeSeconds * 1000);
            filterComplex += `[${inputIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=0:end=${track.durationSeconds},adelay=${delayMs}|${delayMs},volume=${track.gainDb}dB[a${inputIndex}];`;
            mixInputs += `[a${inputIndex}]`;
          });
          filterComplex += `${mixInputs}amix=inputs=${audioTracks.length}:duration=longest:dropout_transition=2[aout]`;
          args.push('-filter_complex', filterComplex, '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-shortest');
        }

        args.push('-movflags', '+faststart', tempOutputPath);

        try {
          await runProcess(ffmpegPath, args, { timeoutMs, signal });
        } catch (error) {
          throw processError(error, signal, 'composition');
        }

        const outputMetadata = await probe(tempOutputPath, 'Composer output', signal);
        const videoStream = outputMetadata.streams.find((stream) => stream.codec_type === 'video');
        const hasAudioStream = outputMetadata.streams.some((stream) => stream.codec_type === 'audio');
        const outputFps = parseFrameRate(videoStream?.avg_frame_rate) ?? parseFrameRate(videoStream?.r_frame_rate);
        if (
          !videoStream ||
          videoStream.width !== expectedWidth ||
          videoStream.height !== expectedHeight ||
          outputFps === null ||
          Math.abs(outputFps - fps) > 0.01
        ) {
          throw new DomainError('VALIDATION_FAILED', 'Composer output dimensions or FPS do not match the request.');
        }
        if (audioTracks.length > 0 && !hasAudioStream) {
          throw new DomainError('VALIDATION_FAILED', 'Composer output is missing the requested audio stream.');
        }

        const output = await readFile(tempOutputPath);
        if (output.byteLength === 0) {
          throw new DomainError('VALIDATION_FAILED', 'Composer output is empty.');
        }
        return output;
      } finally {
        await unlink(listFilePath).catch(() => undefined);
        await unlink(tempOutputPath).catch(() => undefined);
        await Promise.all(motionClipPaths.map((path) => unlink(path).catch(() => undefined)));
      }
    },
  };
}
