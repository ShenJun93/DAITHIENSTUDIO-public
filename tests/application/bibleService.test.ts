import { describe, expect, it } from 'vitest';
import { parseSnapshotId, snapshotIdFor } from '@/application/services/bibleService';

/**
 * Pins bibleService's own delegation choice, not just the domain function it
 * delegates to — a future edit that rewires bibleService.parseSnapshotId to
 * the union parseVersionId (accepting prompt-shaped ids) must fail here even
 * if the domain-level test for parseSnapshotId itself still passes.
 */
describe('bibleService snapshot id grammar', () => {
  it('snapshotIdFor formats a bible code and version into the canonical CODE_VN id', () => {
    expect(snapshotIdFor('CHAR001', 2)).toBe('CHAR001_V2');
    expect(snapshotIdFor('STY001', 1)).toBe('STY001_V1');
  });

  it('parseSnapshotId parses a bible snapshot id', () => {
    expect(parseSnapshotId('CHAR001_V2')).toEqual({ code: 'CHAR001', version: 2 });
  });

  it('parseSnapshotId rejects a prompt-shaped "<id>@<version>" id', () => {
    expect(() => parseSnapshotId('promptId@3')).toThrow('Not a bible snapshot id: "promptId@3"');
  });

  it('parseSnapshotId rejects malformed input', () => {
    expect(() => parseSnapshotId('not-a-version')).toThrow('Not a bible snapshot id: "not-a-version"');
  });
});
