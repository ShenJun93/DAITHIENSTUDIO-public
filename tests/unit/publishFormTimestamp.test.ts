import { describe, expect, it } from 'vitest';
import { formatPublishTimestamp } from '@/app/projects/[slug]/export/PublishForm';

describe('TASK-REFINE-001 publish timestamp hydration safety', () => {
  it('renders a fixed ISO-derived UTC string for a valid timestamp, independent of any locale or timezone', () => {
    // A single hard-coded expected string is itself the proof: this test
    // passes identically no matter what locale/TZ the machine running it
    // (server or CI) is set to, because the implementation never reads
    // process/browser locale or timezone data.
    expect(formatPublishTimestamp('2026-07-31T19:56:42.123Z')).toBe('2026-07-31 19:56:42 UTC');
  });

  it('is unaffected by fractional seconds and always reports whole-second UTC', () => {
    expect(formatPublishTimestamp('2026-01-05T00:00:00.999Z')).toBe('2026-01-05 00:00:00 UTC');
  });

  it('normalizes a non-UTC offset input to the equivalent UTC wall-clock time', () => {
    // +07:00 offset — 2026-07-31T19:56:42+07:00 is 2026-07-31T12:56:42Z.
    expect(formatPublishTimestamp('2026-07-31T19:56:42+07:00')).toBe('2026-07-31 12:56:42 UTC');
  });

  it('falls back safely for an invalid date string instead of rendering "Invalid Date" or throwing', () => {
    expect(formatPublishTimestamp('not-a-date')).toBe('Unknown time');
  });

  it('falls back safely for an empty string', () => {
    expect(formatPublishTimestamp('')).toBe('Unknown time');
  });
});
