/**
 * TASK-REFINE-003: metadata probing for manually uploaded media.
 * Fixtures are real, tiny, deterministic files (base64-embedded in
 * tests/fixtures/media/*Base64.ts — the raw binaries live alongside them
 * for reference) generated once with ffmpeg, not mock/AI provider output
 * and not fetched from any network.
 */
import { describe, expect, it } from 'vitest';
import { createMediaMetadataProbe } from '@/infrastructure/storage/mediaMetadataProbe';
import { TINY_IMAGE_PNG_BASE64 } from '../fixtures/media/tinyImagePngBase64';
import { TINY_VIDEO_MP4_BASE64 } from '../fixtures/media/tinyVideoMp4Base64';
import { TINY_AUDIO_WAV_BASE64 } from '../fixtures/media/tinyAudioWavBase64';

const imageBuffer = () => Buffer.from(TINY_IMAGE_PNG_BASE64, 'base64');
const videoBuffer = () => Buffer.from(TINY_VIDEO_MP4_BASE64, 'base64');
const audioBuffer = () => Buffer.from(TINY_AUDIO_WAV_BASE64, 'base64');

describe('media metadata probe', () => {
  it('probes width and height from a real PNG', async () => {
    const probe = createMediaMetadataProbe();

    const result = await probe.probe(imageBuffer(), 'image/png');

    expect(result).toEqual({ width: 64, height: 48, durationSeconds: null });
  });

  it('probes width, height and duration from a real MP4', async () => {
    const probe = createMediaMetadataProbe();

    const result = await probe.probe(videoBuffer(), 'video/mp4');

    expect(result?.width).toBe(32);
    expect(result?.height).toBe(24);
    // Container/muxer rounding means the reported duration is rarely exact;
    // the fixture was rendered at 1s, so tolerate +/-200ms of container drift.
    expect(result?.durationSeconds).toBeGreaterThan(0.8);
    expect(result?.durationSeconds).toBeLessThan(1.2);
  });

  it('probes duration from a real WAV, with no width/height for audio', async () => {
    const probe = createMediaMetadataProbe();

    const result = await probe.probe(audioBuffer(), 'audio/wav');

    expect(result?.width).toBeNull();
    expect(result?.height).toBeNull();
    expect(result?.durationSeconds).toBeGreaterThan(0.4);
    expect(result?.durationSeconds).toBeLessThan(0.6);
  });

  it('returns null for an unsupported MIME type instead of guessing', async () => {
    const probe = createMediaMetadataProbe();

    const result = await probe.probe(imageBuffer(), 'application/pdf');

    expect(result).toBeNull();
  });

  it('returns null, never a fabricated zero, when ffprobe is not available', async () => {
    const probe = createMediaMetadataProbe({ ffprobePath: 'this-executable-does-not-exist-anywhere' });

    const result = await probe.probe(videoBuffer(), 'video/mp4');

    expect(result).toBeNull();
  });

  it('returns null for a corrupt file declared as a supported type, without throwing', async () => {
    const probe = createMediaMetadataProbe();
    const garbage = Buffer.from('this is not a real video file, just plain text bytes');

    await expect(probe.probe(garbage, 'video/mp4')).resolves.toBeNull();
  });

  it('returns null for an empty buffer without invoking any probe', async () => {
    const probe = createMediaMetadataProbe();

    const result = await probe.probe(Buffer.alloc(0), 'image/png');

    expect(result).toBeNull();
  });
});
