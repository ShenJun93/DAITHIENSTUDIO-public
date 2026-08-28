import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createFFmpegAdapter,
  type MediaProcessRunner,
} from '@/infrastructure/ffmpeg/adapter';

const VALID_VIDEO_PROBE = JSON.stringify({
  streams: [
    {
      codec_type: 'video',
      width: 320,
      height: 180,
      avg_frame_rate: '24/1',
      r_frame_rate: '24/1',
    },
  ],
  format: { duration: '1.0' },
});

describe('FFmpeg adapter media safeguards', () => {
  let root = '';
  let mediaDir = '';
  let workDir = '';
  let inputPath = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-ffmpeg-test-'));
    mediaDir = join(root, 'media');
    workDir = join(root, 'work');
    await mkdir(mediaDir);
    await mkdir(workDir);
    inputPath = join(mediaDir, 'input.mp4');
    await writeFile(inputPath, Buffer.from('fixture-input'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function adapterWith(runProcess: MediaProcessRunner) {
    return createFFmpegAdapter({
      runProcess,
      tempDirectory: workDir,
      timeoutMs: 50,
    });
  }

  it('rejects an empty video input set before starting a process', async () => {
    const runProcess = vi.fn<MediaProcessRunner>();
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({ videos: [], resolution: '320x180', fps: 24 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('rejects an unsupported video MIME before starting a process', async () => {
    const runProcess = vi.fn<MediaProcessRunner>();
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: inputPath, mimeType: 'image/svg+xml' }],
        resolution: '320x180',
        fps: 24,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('reports a missing input before invoking FFprobe', async () => {
    const runProcess = vi.fn<MediaProcessRunner>();
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: join(mediaDir, 'missing.mp4'), mimeType: 'video/mp4' }],
        resolution: '320x180',
        fps: 24,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(runProcess).not.toHaveBeenCalled();
  });

  it('rejects malformed media when FFprobe finds no video stream', async () => {
    const runProcess = vi.fn<MediaProcessRunner>().mockResolvedValue({
      stdout: JSON.stringify({ streams: [], format: {} }),
      stderr: '',
    });
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: inputPath, mimeType: 'video/mp4' }],
        resolution: '320x180',
        fps: 24,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(runProcess).toHaveBeenCalledTimes(1);
  });

  it('maps a process timeout to MEDIA_TIMEOUT and removes temporary files', async () => {
    const timeoutError = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT', killed: true });
    const runProcess = vi.fn<MediaProcessRunner>(async (executable) => {
      if (executable === 'ffprobe') return { stdout: VALID_VIDEO_PROBE, stderr: '' };
      throw timeoutError;
    });
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: inputPath, mimeType: 'video/mp4' }],
        resolution: '320x180',
        fps: 24,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_TIMEOUT' });
    expect(await readdir(workDir)).toEqual([]);
  });

  it('honours cancellation and removes temporary files', async () => {
    const controller = new AbortController();
    controller.abort();
    const runProcess = vi.fn<MediaProcessRunner>();
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: inputPath, mimeType: 'video/mp4' }],
        resolution: '320x180',
        fps: 24,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_CANCELLED' });
    expect(runProcess).not.toHaveBeenCalled();
    expect(await readdir(workDir)).toEqual([]);
  });

  it('forwards cancellation to a running FFmpeg process', async () => {
    const controller = new AbortController();
    const runProcess = vi.fn<MediaProcessRunner>(async (executable, _args, options) => {
      expect(options.signal).toBe(controller.signal);
      if (executable === 'ffprobe') return { stdout: VALID_VIDEO_PROBE, stderr: '' };
      controller.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError', code: 'ABORT_ERR' });
    });
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: inputPath, mimeType: 'video/mp4' }],
        resolution: '320x180',
        fps: 24,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_CANCELLED' });
    expect(runProcess).toHaveBeenCalledWith(
      'ffmpeg',
      expect.any(Array),
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(await readdir(workDir)).toEqual([]);
  });

  it('removes a partial output when FFmpeg fails', async () => {
    const runProcess = vi.fn<MediaProcessRunner>(async (executable, args) => {
      if (executable === 'ffprobe') return { stdout: VALID_VIDEO_PROBE, stderr: '' };
      await writeFile(args.at(-1)!, Buffer.from('partial-output'));
      throw new Error('encoder failed');
    });
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: inputPath, mimeType: 'video/mp4' }],
        resolution: '320x180',
        fps: 24,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_FAILED' });
    expect(await readdir(workDir)).toEqual([]);
  });

  it('rejects output whose probed dimensions or FPS differ from the request', async () => {
    let probeCount = 0;
    const mismatchedOutput = JSON.stringify({
      streams: [
        {
          codec_type: 'video',
          width: 640,
          height: 360,
          avg_frame_rate: '30/1',
          r_frame_rate: '30/1',
        },
      ],
      format: { duration: '1.0' },
    });
    const runProcess = vi.fn<MediaProcessRunner>(async (executable, args) => {
      if (executable === 'ffprobe') {
        probeCount += 1;
        return { stdout: probeCount === 1 ? VALID_VIDEO_PROBE : mismatchedOutput, stderr: '' };
      }
      await writeFile(args.at(-1)!, Buffer.from('complete-output'));
      return { stdout: '', stderr: '' };
    });
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: inputPath, mimeType: 'video/mp4' }],
        resolution: '320x180',
        fps: 24,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(probeCount).toBe(2);
    expect(await readdir(workDir)).toEqual([]);
  });

  it('returns bytes only after the output probe confirms dimensions and FPS', async () => {
    const expected = Buffer.from('validated-output');
    const runProcess = vi.fn<MediaProcessRunner>(async (executable, args) => {
      if (executable === 'ffprobe') return { stdout: VALID_VIDEO_PROBE, stderr: '' };
      await writeFile(args.at(-1)!, expected);
      return { stdout: '', stderr: '' };
    });
    const adapter = adapterWith(runProcess);

    await expect(
      adapter.concatenateVideos({
        videos: [{ path: inputPath, mimeType: 'video/mp4' }],
        resolution: '320x180',
        fps: 24,
      }),
    ).resolves.toEqual(expected);
    expect(await readdir(workDir)).toEqual([]);
  });
});
