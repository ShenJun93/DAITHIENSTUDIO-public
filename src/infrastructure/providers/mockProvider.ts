/**
 * Mock provider — the whole studio runs end to end with no API key and no cost.
 *
 * The artefacts it produces are *real files*, not empty placeholders:
 *   image  → an SVG slate that prints the shot code, locks and seed, so a
 *            wrong prompt is visible in the asset library at a glance
 *   video  → an animated SVG (SMIL) that actually moves in the browser, with
 *            the requested duration recorded in metadata
 *   voice  → a valid mono 22.05 kHz WAV tone shaped by the text length
 *   text   → deterministic structured JSON for the schemas the app requests
 *
 * Determinism matters: the same request always produces byte-identical output,
 * which is what makes the end-to-end test meaningful.
 */
import { createHash } from 'node:crypto';
import type {
  ImageProvider,
  ImageRequest,
  ProviderDescriptor,
  ProviderResult,
  TextProvider,
  TextRequest,
  VideoProvider,
  VideoRequest,
  VoiceProvider,
  VoiceRequest,
} from '@/application/ports';
import { MOCK_CAPABILITIES } from './capabilities';

export const MOCK_DESCRIPTOR: ProviderDescriptor = {
  key: 'mock',
  label: 'Mock (offline, free)',
  offline: true,
  models: {
    image: ['mock-image-v1'],
    video: ['mock-video-v1'],
    voice: ['mock-voice-v1'],
    music: ['mock-music-v1'],
    sound: ['mock-sound-v1'],
    text: ['mock-text-v1'],
  },
  capabilities: MOCK_CAPABILITIES,
};

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function paletteFrom(seedHex: string): [string, string, string] {
  const hue = Number.parseInt(seedHex.slice(0, 2), 16) * 1.41;
  return [
    `hsl(${Math.round(hue) % 360} 55% 22%)`,
    `hsl(${Math.round(hue + 40) % 360} 62% 46%)`,
    `hsl(${Math.round(hue + 190) % 360} 70% 72%)`,
  ];
}

function dimensionsFor(aspectRatio: string): { width: number; height: number } {
  const table: Record<string, [number, number]> = {
    '16:9': [1920, 1080],
    '9:16': [1080, 1920],
    '1:1': [1080, 1080],
    '4:5': [1080, 1350],
    '2.39:1': [2048, 858],
    '21:9': [2560, 1080],
    '3:2': [1620, 1080],
  };
  const [width, height] = table[aspectRatio] ?? [1920, 1080];
  return { width, height };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > perLine) {
      lines.push(line.trim());
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim() && lines.length < maxLines) lines.push(line.trim());
  return lines;
}

function slate(input: {
  title: string;
  prompt: string;
  negative: string;
  footer: string;
  width: number;
  height: number;
  seedHex: string;
  animated: boolean;
  durationSeconds?: number;
}): string {
  const [deep, mid, light] = paletteFrom(input.seedHex);
  const lines = wrap(input.prompt, 62, 9);
  const negativeLines = wrap(input.negative, 70, 2);
  const bodyFont = Math.round(input.height / 42);
  const motion = input.animated
    ? `
  <g opacity="0.9">
    <circle cx="0" cy="${input.height * 0.5}" r="${input.height * 0.06}" fill="${light}" opacity="0.55">
      <animate attributeName="cx" from="${input.width * 0.1}" to="${input.width * 0.9}"
               dur="${input.durationSeconds ?? 5}s" repeatCount="indefinite" />
    </circle>
    <rect x="0" y="${input.height - 14}" width="${input.width}" height="6" fill="${light}" opacity="0.35">
      <animate attributeName="width" from="0" to="${input.width}"
               dur="${input.durationSeconds ?? 5}s" repeatCount="indefinite" />
    </rect>
  </g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}"
     viewBox="0 0 ${input.width} ${input.height}" role="img" aria-label="${escapeXml(input.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${deep}" />
      <stop offset="100%" stop-color="${mid}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <rect x="${input.width * 0.03}" y="${input.height * 0.05}" width="${input.width * 0.94}"
        height="${input.height * 0.9}" fill="none" stroke="${light}" stroke-width="3" stroke-dasharray="14 10" opacity="0.6" />
  <text x="${input.width * 0.06}" y="${input.height * 0.16}" font-family="monospace"
        font-size="${Math.round(input.height / 20)}" fill="${light}" font-weight="700">${escapeXml(input.title)}</text>
${lines
  .map(
    (line, index) =>
      `  <text x="${input.width * 0.06}" y="${input.height * 0.26 + index * bodyFont * 1.5}" font-family="monospace" font-size="${bodyFont}" fill="#ffffff" opacity="0.92">${escapeXml(line)}</text>`,
  )
  .join('\n')}
${negativeLines
  .map(
    (line, index) =>
      `  <text x="${input.width * 0.06}" y="${input.height * 0.78 + index * bodyFont * 1.3}" font-family="monospace" font-size="${Math.round(bodyFont * 0.8)}" fill="#ffd9d9" opacity="0.85">NEG ${escapeXml(line)}</text>`,
  )
  .join('\n')}
  <text x="${input.width * 0.06}" y="${input.height * 0.93}" font-family="monospace"
        font-size="${Math.round(bodyFont * 0.85)}" fill="${light}">${escapeXml(input.footer)}</text>
${motion}
</svg>
`;
}

/** Minimal valid RIFF/WAVE writer — 16-bit PCM mono. */
function wav(samples: Int16Array, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = samples.length * 2;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const body = Buffer.alloc(dataSize);
  for (let i = 0; i < samples.length; i += 1) {
    body.writeInt16LE(samples[i] ?? 0, i * 2);
  }
  return Buffer.concat([header, body]);
}

function toneFor(text: string, seconds: number, sampleRate = 22_050): Buffer {
  const total = Math.max(1, Math.round(seconds * sampleRate));
  const samples = new Int16Array(total);
  const seedHex = hash(text);
  const base = 150 + (Number.parseInt(seedHex.slice(0, 2), 16) % 90);

  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    // Syllable-rate amplitude envelope so it reads as speech-like cadence.
    const syllable = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.4 * t);
    const attack = Math.min(1, t * 12);
    const release = Math.min(1, (seconds - t) * 6);
    const carrier = Math.sin(2 * Math.PI * base * t) * 0.6 + Math.sin(2 * Math.PI * base * 2 * t) * 0.25;
    const value = carrier * syllable * attack * Math.max(0, release) * 0.55;
    samples[i] = Math.max(-32_768, Math.min(32_767, Math.round(value * 32_767)));
  }
  return wav(samples, sampleRate);
}

function musicFor(text: string, seconds: number, sampleRate = 22_050): Buffer {
  const total = Math.max(1, Math.round(seconds * sampleRate));
  const samples = new Int16Array(total);
  const seedHex = hash(text);
  const root = 110 + (Number.parseInt(seedHex.slice(0, 2), 16) % 48);
  const chord = [root, root * 1.25, root * 1.5];
  const tempo = 0.5 + (Number.parseInt(seedHex.slice(2, 4), 16) % 8) / 8;

  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    // Steady beat and a chord so it reads as music rather than speech.
    const beat = 0.6 + 0.4 * Math.sin(2 * Math.PI * tempo * t);
    const chordValue = chord.reduce((sum, freq) => sum + Math.sin(2 * Math.PI * freq * t) * 0.25, 0);
    const attack = Math.min(1, t * 3);
    const release = Math.min(1, (seconds - t) * 2);
    const value = chordValue * beat * attack * Math.max(0, release) * 0.8;
    samples[i] = Math.max(-32_768, Math.min(32_767, Math.round(value * 32_767)));
  }
  return wav(samples, sampleRate);
}

function soundFor(text: string, seconds: number, sampleRate = 22_050): Buffer {
  const total = Math.max(1, Math.round(seconds * sampleRate));
  const samples = new Int16Array(total);
  const seedHex = hash(text);
  const noise = Number.parseInt(seedHex.slice(0, 4), 16) % 9973;

  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    // Sweeping pitched burst so it reads as a sound effect, not speech.
    const sweepFreq = 200 + t * 220 * (1 + (noise % 3));
    const tone = Math.sin(2 * Math.PI * sweepFreq * t);
    const attack = Math.min(1, t * 20);
    const release = Math.min(1, (seconds - t) * 10);
    const value = tone * attack * Math.max(0, release) * 0.7;
    samples[i] = Math.max(-32_768, Math.min(32_767, Math.round(value * 32_767)));
  }
  return wav(samples, sampleRate);
}

export class MockImageProvider implements ImageProvider {
  readonly descriptor = MOCK_DESCRIPTOR;

  async generateImage(request: ImageRequest): Promise<ProviderResult> {
    const { width, height } = dimensionsFor(request.aspectRatio);
    const seedHex = hash(`${request.prompt}|${request.seed ?? 0}|${request.model}`);
    const artifacts = Array.from({ length: Math.max(1, request.count) }, (_, index) => {
      const svg = slate({
        title: `MOCK IMAGE · ${request.aspectRatio}`,
        prompt: request.prompt,
        negative: request.negativePrompt,
        footer: `model=${request.model} seed=${request.seed ?? 'auto'} refs=${request.referenceFiles.length} variant=${index + 1}`,
        width,
        height,
        seedHex: hash(`${seedHex}|${index}`),
        animated: false,
      });
      return {
        filename: `mock-image-${seedHex.slice(0, 8)}-${index + 1}.svg`,
        mimeType: 'image/svg+xml',
        data: Buffer.from(svg, 'utf8'),
        width,
        height,
      };
    });

    return { artifacts, raw: { provider: 'mock', seedHex }, actualCostUsd: 0, modelUsed: request.model };
  }
}

export class MockVideoProvider implements VideoProvider {
  readonly descriptor = MOCK_DESCRIPTOR;

  async generateVideo(request: VideoRequest): Promise<ProviderResult> {
    const { width, height } = dimensionsFor(request.aspectRatio);
    const seedHex = hash(`${request.prompt}|${request.seed ?? 0}|${request.durationSeconds}`);
    const svg = slate({
      title: `MOCK VIDEO · ${request.durationSeconds}s · ${request.aspectRatio}`,
      prompt: request.prompt,
      negative: request.negativePrompt,
      footer: `model=${request.model} firstFrame=${request.firstFrame ? 'yes' : 'no'} lastFrame=${request.lastFrame ? 'yes' : 'no'}`,
      width,
      height,
      seedHex,
      animated: true,
      durationSeconds: request.durationSeconds,
    });

    return {
      artifacts: [
        {
          filename: `mock-video-${seedHex.slice(0, 8)}.svg`,
          mimeType: 'image/svg+xml',
          data: Buffer.from(svg, 'utf8'),
          width,
          height,
          durationSeconds: request.durationSeconds,
        },
      ],
      raw: { provider: 'mock', seedHex, note: 'animated SVG stand-in for a video render' },
      actualCostUsd: 0,
      modelUsed: request.model,
    };
  }
}

export class MockVoiceProvider implements VoiceProvider {
  readonly descriptor = MOCK_DESCRIPTOR;

  async synthesize(request: VoiceRequest): Promise<ProviderResult> {
    const characters = request.text.trim().length;
    const seconds = Math.max(0.8, Math.min(120, (characters / 14) / Math.max(0.5, request.speed)));
    const data = toneFor(`${request.text}|${request.voiceName}`, seconds);
    const seedHex = hash(`${request.text}|${request.voiceName}|${request.speed}`);

    return {
      artifacts: [
        {
          filename: `mock-voice-${seedHex.slice(0, 8)}.wav`,
          mimeType: 'audio/wav',
          data,
          durationSeconds: Math.round(seconds * 100) / 100,
        },
      ],
      raw: { provider: 'mock', characters, voice: request.voiceName },
      actualCostUsd: 0,
      modelUsed: request.model,
    };
  }
}

export class MockTextProvider implements TextProvider {
  readonly descriptor = MOCK_DESCRIPTOR;

  async complete<T>(request: TextRequest): Promise<{ value: T; raw: Record<string, unknown>; costUsd: number }> {
    const seedHex = hash(`${request.jsonSchemaName}|${request.input}`);
    const value = buildMockStructuredOutput(request, seedHex) as T;
    return { value, raw: { provider: 'mock', schema: request.jsonSchemaName, seedHex }, costUsd: 0 };
  }
}

export class MockMusicProvider implements VoiceProvider {
  readonly descriptor = MOCK_DESCRIPTOR;

  async synthesize(request: VoiceRequest): Promise<ProviderResult> {
    const seconds = Math.max(1, Math.min(300, Number(request.params.durationSeconds ?? 8)));
    const data = musicFor(`${request.text}|${request.model}`, seconds);
    const seedHex = hash(`${request.text}|${request.model}|${seconds}`);

    return {
      artifacts: [
        {
          filename: `mock-music-${seedHex.slice(0, 8)}.wav`,
          mimeType: 'audio/wav',
          data,
          durationSeconds: Math.round(seconds * 100) / 100,
        },
      ],
      raw: { provider: 'mock', model: request.model, seconds },
      actualCostUsd: 0,
      modelUsed: request.model,
    };
  }
}

export class MockSoundProvider implements VoiceProvider {
  readonly descriptor = MOCK_DESCRIPTOR;

  async synthesize(request: VoiceRequest): Promise<ProviderResult> {
    const seconds = Math.max(1, Math.min(60, Number(request.params.durationSeconds ?? 2)));
    const data = soundFor(`${request.text}|${request.model}`, seconds);
    const seedHex = hash(`${request.text}|${request.model}|${seconds}`);

    return {
      artifacts: [
        {
          filename: `mock-sound-${seedHex.slice(0, 8)}.wav`,
          mimeType: 'audio/wav',
          data,
          durationSeconds: Math.round(seconds * 100) / 100,
        },
      ],
      raw: { provider: 'mock', model: request.model, seconds },
      actualCostUsd: 0,
      modelUsed: request.model,
    };
  }
}

/**
 * Deterministic stand-ins for the structured outputs the app asks for. Anything
 * unknown returns `{}` so callers must handle a missing enrichment rather than
 * trusting invented content.
 */
function buildMockStructuredOutput(request: TextRequest, seedHex: string): unknown {
  const sentences = request.input
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  switch (request.jsonSchemaName) {
    case 'story-development': {
      const first = sentences[0] ?? request.input.slice(0, 140);
      return {
        logline: first.slice(0, 200),
        synopsis: sentences.slice(0, 5).join(' ').slice(0, 1200),
        theme: 'Kiên trì trước thất bại',
        tone: 'Hài, ấm áp, hơi châm biếm',
        hook: sentences[0]?.slice(0, 120) ?? '',
        cliffhanger: sentences[sentences.length - 1]?.slice(0, 120) ?? '',
        beats: [1, 2, 3].map((act) => ({
          act,
          title: `Act ${act}`,
          description: sentences[act - 1] ?? `Act ${act} beat derived from the premise.`,
        })),
      };
    }
    case 'scene-enrichment': {
      return {
        scenes: sentences.slice(0, 12).map((sentence, index) => ({
          sceneNumber: index + 1,
          summary: sentence.slice(0, 240),
          emotion: ['curious', 'tense', 'comedic', 'hopeful'][index % 4],
          visualGoal: 'Đọc rõ không gian và cảm xúc nhân vật chính trong 2 giây đầu.',
          audioGoal: 'Ambience nền + nhấn một sound effect ở cao trào.',
        })),
      };
    }
    case 'production-advisory': {
      // M9 initial slice: signals are real (parsed from the caller's own
      // gathered project state), not invented. The 'continuity'/'risk-cost'/
      // 'next-action' suggestions only appear when the parsed signal actually
      // warrants one. This deterministic mock stands in for a real text
      // provider's judgment — it does not pretend to originality.
      const readNumber = (key: string): number => {
        const match = new RegExp(`${key}:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(request.input);
        return match ? Number.parseFloat(match[1] as string) : 0;
      };
      const continuityFindingCount = readNumber('continuityFindingCount');
      const costSpentUsd = readNumber('costSpentUsd');
      const costCeilingUsd = readNumber('costCeilingUsd');
      const unreadyShotCount = readNumber('unreadyShotCount');
      const totalShotCount = readNumber('totalShotCount');

      const suggestions: Array<{ kind: string; message: string; rationale: string }> = [];

      if (continuityFindingCount > 0) {
        suggestions.push({
          kind: 'continuity',
          message: `${continuityFindingCount} continuity finding(s) are currently open.`,
          rationale: 'Open continuity findings should be resolved before shots referencing them are approved.',
        });
      }

      if (costCeilingUsd > 0 && costSpentUsd / costCeilingUsd > 0.8) {
        suggestions.push({
          kind: 'risk-cost',
          message: `Spend is at ${Math.round((costSpentUsd / costCeilingUsd) * 100)}% of the project cost ceiling.`,
          rationale: 'Approaching the ceiling risks blocking further generation until the budget is raised.',
        });
      }

      if (unreadyShotCount > 0) {
        suggestions.push({
          kind: 'next-action',
          message: `${unreadyShotCount} of ${totalShotCount || unreadyShotCount} shot(s) are not yet ready for production.`,
          rationale: 'Bringing the remaining shots to ready keeps the project moving through the Produce phase.',
        });
      }

      suggestions.push({
        kind: 'script-scene-shot',
        message: 'Review scene pacing for shots with long, uninterrupted dialogue.',
        rationale: 'A mock, illustrative suggestion — a real text provider would read the actual script content.',
      });
      suggestions.push({
        kind: 'prompt',
        message: 'Consider adding a lighting cue to prompts missing one.',
        rationale: 'A mock, illustrative suggestion — a real text provider would read the actual prompt text.',
      });

      return { suggestions };
    }
    default:
      return { note: `mock provider has no fixture for schema "${request.jsonSchemaName}"`, seedHex };
  }
}
