/**
 * Quality-control checklist (spec §25).
 *
 * Checks that the studio can evaluate from stored metadata run automatically.
 * Checks that need human eyes are returned with status `manual` rather than
 * silently passing — a green report that never looked at anything is worse
 * than no report.
 */
import type { QualityCheck } from './schemas';

export interface QualitySubject {
  kind: 'image' | 'video' | 'voice' | 'music' | 'sound' | 'other';
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  expectedAspectRatio: string;
  expectedDurationSeconds: number | null;
  expectedResolution: string | null;
  hasCharacterLock: boolean;
  hasStyleLock: boolean;
  hasLocationLock: boolean;
  referencedPropCount: number;
  shotPropCount: number;
  loudnessDbfs: number | null;
  subtitleAligned: boolean | null;
}

function ratioValue(ratio: string): number | null {
  const [w, h] = ratio.split(':').map((part) => Number.parseFloat(part));
  if (!w || !h) return null;
  return w / h;
}

export function buildQualityReport(subject: QualitySubject): { checks: QualityCheck[]; score: number; passed: boolean } {
  const checks: QualityCheck[] = [];
  const add = (
    id: string,
    label: string,
    category: QualityCheck['category'],
    severity: QualityCheck['severity'],
    status: QualityCheck['status'],
    detail = '',
  ): void => {
    checks.push({ id, label, category, severity, status, detail });
  };

  // --- Structural checks -------------------------------------------------
  add(
    'file-present',
    'Asset file exists and is not empty',
    'production',
    'blocker',
    subject.sizeBytes > 0 ? 'pass' : 'fail',
    subject.sizeBytes > 0 ? `${subject.sizeBytes} bytes` : 'File is empty',
  );

  if (subject.kind === 'image' || subject.kind === 'video') {
    const expected = ratioValue(subject.expectedAspectRatio);
    const actual = subject.width && subject.height ? subject.width / subject.height : null;
    add(
      'aspect-ratio',
      `Aspect ratio matches ${subject.expectedAspectRatio}`,
      subject.kind,
      'major',
      actual === null ? 'manual' : expected && Math.abs(actual - expected) < 0.02 ? 'pass' : 'fail',
      actual === null ? 'Dimensions unknown' : `${subject.width}×${subject.height}`,
    );

    if (subject.expectedResolution) {
      const [w, h] = subject.expectedResolution.split('x').map((n) => Number.parseInt(n, 10));
      const enough = subject.width !== null && subject.height !== null && w !== undefined && h !== undefined
        ? subject.width >= w && subject.height >= h
        : null;
      add(
        'resolution',
        `Resolution is at least ${subject.expectedResolution}`,
        subject.kind,
        'major',
        enough === null ? 'manual' : enough ? 'pass' : 'fail',
        enough === false ? `Got ${subject.width}×${subject.height}` : '',
      );
    }

    add(
      'character-lock',
      'Character Lock was applied to the source prompt',
      'production',
      'blocker',
      subject.hasCharacterLock ? 'pass' : 'fail',
      subject.hasCharacterLock ? '' : 'Identity was not pinned to a bible version',
    );
    add(
      'style-lock',
      'Style Lock was applied',
      'production',
      'major',
      subject.hasStyleLock ? 'pass' : 'warn',
    );
    add(
      'location-lock',
      'Location Lock was applied',
      'production',
      'minor',
      subject.hasLocationLock ? 'pass' : 'warn',
    );
    add(
      'prop-coverage',
      'Every prop the shot declares is referenced by the prompt',
      'production',
      'major',
      subject.shotPropCount === 0
        ? 'pass'
        : subject.referencedPropCount >= subject.shotPropCount
          ? 'pass'
          : 'fail',
      `${subject.referencedPropCount}/${subject.shotPropCount} props referenced`,
    );

    // --- Human-eye checks ------------------------------------------------
    add('anatomy', 'No extra fingers or broken anatomy', subject.kind, 'blocker', 'manual');
    add('face-integrity', 'Face is not distorted and matches the reference', subject.kind, 'blocker', 'manual');
    add('text-artifacts', 'No garbled text or fake logos', subject.kind, 'major', 'manual');
    add('style-match', 'Output matches the Style Bible', subject.kind, 'major', 'manual');
  }

  if (subject.kind === 'video') {
    const duration = subject.durationSeconds;
    const expectedDuration = subject.expectedDurationSeconds;
    add(
      'duration',
      expectedDuration ? `Duration is about ${expectedDuration}s` : 'Duration recorded',
      'video',
      'major',
      duration === null
        ? 'manual'
        : expectedDuration === null
          ? 'pass'
          : Math.abs(duration - expectedDuration) <= Math.max(1, expectedDuration * 0.2)
            ? 'pass'
            : 'fail',
      duration === null ? 'Duration unknown' : `${duration}s`,
    );
    add('flicker', 'No severe flicker between frames', 'video', 'blocker', 'manual');
    add('costume-stability', 'Costume does not change mid-shot', 'video', 'blocker', 'manual');
    add('prop-persistence', 'Props do not disappear mid-shot', 'video', 'major', 'manual');
    add('camera-match', 'Camera movement matches the shot spec', 'video', 'major', 'manual');
    add('edit-points', 'First and last frames are usable as cut points', 'video', 'major', 'manual');
  }

  if (subject.kind === 'voice' || subject.kind === 'music' || subject.kind === 'sound') {
    const loud = subject.loudnessDbfs;
    add(
      'clipping',
      'No clipping (peak below 0 dBFS)',
      'audio',
      'blocker',
      loud === null ? 'manual' : loud < -0.5 ? 'pass' : 'fail',
      loud === null ? 'Loudness not measured' : `${loud} dBFS`,
    );
    add(
      'duration-audio',
      'Audio length recorded',
      'audio',
      'minor',
      subject.durationSeconds ? 'pass' : 'manual',
      subject.durationSeconds ? `${subject.durationSeconds}s` : '',
    );
    if (subject.kind === 'voice') {
      add(
        'subtitle-sync',
        'Subtitle timing matches the voice track',
        'audio',
        'major',
        subject.subtitleAligned === null ? 'manual' : subject.subtitleAligned ? 'pass' : 'fail',
      );
      add('voice-identity', 'Voice matches the character profile', 'audio', 'major', 'manual');
      add('music-balance', 'Music does not mask dialogue', 'audio', 'major', 'manual');
    }
  }

  const weights: Record<QualityCheck['severity'], number> = { blocker: 3, major: 2, minor: 1 };
  let earned = 0;
  let possible = 0;
  for (const check of checks) {
    if (check.status === 'manual') continue;
    const weight = weights[check.severity];
    possible += weight;
    if (check.status === 'pass') earned += weight;
    else if (check.status === 'warn') earned += weight * 0.5;
  }

  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  const blockerFailed = checks.some((check) => check.severity === 'blocker' && check.status === 'fail');
  return { checks, score, passed: !blockerFailed && score >= 80 };
}

export function pendingManualChecks(checks: QualityCheck[]): QualityCheck[] {
  return checks.filter((check) => check.status === 'manual');
}
