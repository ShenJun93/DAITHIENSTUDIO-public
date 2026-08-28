import { describe, expect, it } from 'vitest';
import { formatSnapshotId, parseSnapshotId, parseVersionId } from '@/domain/visualControl/approvedVersions';

describe('formatSnapshotId', () => {
  it('formats a bible code and version into the canonical CODE_VN snapshot id', () => {
    expect(formatSnapshotId('CHAR001', 2)).toBe('CHAR001_V2');
    expect(formatSnapshotId('LOC002', 1)).toBe('LOC002_V1');
    expect(formatSnapshotId('PROP003', 10)).toBe('PROP003_V10');
    expect(formatSnapshotId('STY001', 1)).toBe('STY001_V1');
  });

  it('round-trips with parseVersionId for every bible snapshot kind', () => {
    for (const [code, version] of [
      ['CHAR001', 1],
      ['LOC002', 3],
      ['PROP003', 7],
      ['STY001', 2],
    ] as const) {
      const snapshotId = formatSnapshotId(code, version);
      expect(parseVersionId(snapshotId)).toEqual({ code, version });
    }
  });
});

describe('parseSnapshotId', () => {
  it('parses a bible snapshot id into code and version', () => {
    expect(parseSnapshotId('CHAR001_V2')).toEqual({ code: 'CHAR001', version: 2 });
    expect(parseSnapshotId('LOC002_V1')).toEqual({ code: 'LOC002', version: 1 });
    expect(parseSnapshotId('PROP003_V10')).toEqual({ code: 'PROP003', version: 10 });
    expect(parseSnapshotId('STY001_V1')).toEqual({ code: 'STY001', version: 1 });
  });

  it('rejects a prompt-shaped "<id>@<version>" id, unlike parseVersionId', () => {
    expect(() => parseSnapshotId('promptId@3')).toThrow('Not a bible snapshot id: "promptId@3"');
    // The exact case bibleService.parseSnapshotId must keep rejecting: a bible-only
    // caller must never silently accept a prompt version id as if it were a bible code.
    expect(() => parseVersionId('promptId@3')).not.toThrow();
  });

  it('rejects malformed input', () => {
    expect(() => parseSnapshotId('not-a-version')).toThrow('Not a bible snapshot id: "not-a-version"');
    expect(() => parseSnapshotId('')).toThrow();
  });

  it('round-trips with formatSnapshotId', () => {
    for (const [code, version] of [
      ['CHAR001', 1],
      ['LOC002', 3],
      ['PROP003', 7],
      ['STY001', 2],
    ] as const) {
      expect(parseSnapshotId(formatSnapshotId(code, version))).toEqual({ code, version });
    }
  });
});
