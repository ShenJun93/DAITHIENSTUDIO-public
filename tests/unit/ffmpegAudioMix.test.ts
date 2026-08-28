import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFFmpegAdapter, type MediaProcessRunner } from '@/infrastructure/ffmpeg/adapter';

describe('FFmpeg persisted audio mixing', () => {
  it('maps timing, duration and gain into a deterministic audio filter graph', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-audio-mix-'));
    const videoPath = join(root, 'shot.mp4');
    const audioPath = join(root, 'music.mp3');
    await Promise.all([writeFile(videoPath, 'video'), writeFile(audioPath, 'audio')]);
    const ffmpegCalls: string[][] = [];
    let composed = false;

    const runProcess: MediaProcessRunner = async (executable, args) => {
      if (executable === 'ffprobe') {
        const path = args.at(-1);
        const streams = path === audioPath
          ? [{ codec_type: 'audio' }]
          : composed
            ? [
                { codec_type: 'video', width: 320, height: 180, avg_frame_rate: '24/1' },
                { codec_type: 'audio' },
              ]
            : [{ codec_type: 'video', width: 320, height: 180, avg_frame_rate: '24/1' }];
        return { stdout: JSON.stringify({ streams, format: { duration: '3' } }), stderr: '' };
      }
      ffmpegCalls.push([...args]);
      composed = true;
      await writeFile(args.at(-1)!, Buffer.from([0, 1, 2]));
      return { stdout: '', stderr: '' };
    };

    try {
      const adapter = createFFmpegAdapter({ tempDirectory: root, runProcess });
      await adapter.concatenateVideos({
        videos: [{ path: videoPath, mimeType: 'video/mp4' }],
        audioTracks: [{
          path: audioPath,
          mimeType: 'audio/mpeg',
          startTimeSeconds: 1.25,
          durationSeconds: 2.5,
          gainDb: -4,
        }],
        resolution: '320x180',
        fps: 24,
      });

      const args = ffmpegCalls[0]!;
      expect(args).toContain(audioPath);
      expect(args).toContain('-filter_complex');
      expect(args.join(' ')).toContain('atrim=start=0:end=2.5');
      expect(args.join(' ')).toContain('adelay=1250|1250');
      expect(args.join(' ')).toContain('volume=-4dB');
      expect(args.join(' ')).toContain('amix=inputs=1');
      expect(args).toContain('aac');
      expect(args).toContain('-shortest');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
