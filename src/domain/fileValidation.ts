import { DomainError } from './errors';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
});

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function asciiEquals(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (bytes.byteLength < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8 && matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && matches(bytes, 0, [0xff, 0xd8, 0xff]);
}

function hasWebpSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && asciiEquals(bytes, 0, 'RIFF') && asciiEquals(bytes, 8, 'WEBP');
}

function hasWavSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && asciiEquals(bytes, 0, 'RIFF') && asciiEquals(bytes, 8, 'WAVE');
}

function hasMp4Signature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8 && asciiEquals(bytes, 4, 'ftyp');
}

function hasWebmSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && matches(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]);
}

function hasMp3Signature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 3) return false;
  if (asciiEquals(bytes, 0, 'ID3')) return true;
  return bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0;
}

function hasSvgDefenseInDepth(bytes: Uint8Array): boolean {
  const inspected = bytes.subarray(0, Math.min(bytes.byteLength, 1024 * 1024));
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(inspected);
  } catch {
    return false;
  }
  const lowered = text.toLowerCase();
  if (!text.trim().startsWith('<') || !lowered.includes('<svg')) return false;
  if (/<script\b/i.test(text)) {
    throw new DomainError('VALIDATION_FAILED', 'SVG contains a <script> tag. Refused as a defense-in-depth measure.');
  }
  return true;
}

function validateExtension(fileName: string, declaredMimeType: string): void {
  const baseName = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = baseName.lastIndexOf('.');
  const extension = dot >= 0 ? baseName.slice(dot + 1).toLowerCase() : '';
  const expectedMimeType = MIME_BY_EXTENSION[extension];
  if (!expectedMimeType || expectedMimeType !== declaredMimeType) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `File extension .${extension || '(none)'} does not match the declared MIME type (${declaredMimeType}).`,
    );
  }
}

/** Validates the filename extension, declared MIME type, size and file signature as one tuple. */
export function validateFileArtifact(bytes: Uint8Array, declaredMimeType: string, fileName: string): void {
  if (bytes.byteLength === 0) {
    throw new DomainError('VALIDATION_FAILED', 'Refusing to store an empty file.');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new DomainError('VALIDATION_FAILED', `File is ${bytes.byteLength} bytes; the limit is ${MAX_UPLOAD_BYTES}.`);
  }

  validateExtension(fileName, declaredMimeType);

  const valid =
    declaredMimeType === 'image/png'
      ? hasPngSignature(bytes)
      : declaredMimeType === 'image/jpeg'
        ? hasJpegSignature(bytes)
        : declaredMimeType === 'image/webp'
          ? hasWebpSignature(bytes)
          : declaredMimeType === 'audio/wav'
            ? hasWavSignature(bytes)
            : declaredMimeType === 'video/mp4'
              ? hasMp4Signature(bytes)
              : declaredMimeType === 'video/webm'
                ? hasWebmSignature(bytes)
                : declaredMimeType === 'audio/mpeg'
                  ? hasMp3Signature(bytes)
                  : declaredMimeType === 'image/svg+xml'
                    ? hasSvgDefenseInDepth(bytes)
                    : false;

  if (!valid) {
    throw new DomainError('VALIDATION_FAILED', `File content does not match the declared MIME type (${declaredMimeType}).`);
  }
}
