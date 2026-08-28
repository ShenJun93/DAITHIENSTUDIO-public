import { describe, expect, it } from 'vitest';
import {
  parseTab,
  buildTabUrl,
  VALID_TABS,
  TAB_LABELS,
  type TabValue,
} from '@/components/shot-inspector/ShotInspectorTabs';

describe('ShotInspectorIA1 — tab parsing', () => {
  it('parses a valid tab value exactly', () => {
    for (const tab of VALID_TABS) {
      expect(parseTab(tab)).toBe(tab);
    }
  });

  it('is case-sensitive and falls back on wrong-case values', () => {
    expect(parseTab('Overview')).toBe('overview');
    expect(parseTab('OVERVIEW')).toBe('overview');
    expect(parseTab('References')).toBe('overview');
    expect(parseTab('Visual Control')).toBe('overview');
    expect(parseTab('prompts')).toBe('prompts');
  });

  it('falls back to overview for missing value (undefined)', () => {
    expect(parseTab(undefined)).toBe('overview');
    expect(parseTab(null)).toBe('overview');
  });

  it('falls back to overview for empty string', () => {
    expect(parseTab('')).toBe('overview');
  });

  it('falls back to overview for invalid values', () => {
    expect(parseTab('unknown')).toBe('overview');
    expect(parseTab('overviewn')) .toBe('overview');
    expect(parseTab('prompt')).toBe('overview');
    expect(parseTab('generations ')).toBe('overview');
    expect(parseTab('tab-overview')).toBe('overview');
  });

  it('falls back to overview for arbitrary strings', () => {
    expect(parseTab('foo')).toBe('overview');
    expect(parseTab('123')).toBe('overview');
    expect(parseTab('tab=prompts')).toBe('overview');
  });

  it('does not redirect, loop, or throw — always returns a TabValue', () => {
    for (const input of [undefined, null, '', 'bad', 'BROKEN', 'prompts ']) {
      const result = parseTab(input);
      expect(typeof result).toBe('string');
      expect(VALID_TABS).toContain(result);
    }
  });

  it('parses visual-control with hyphen correctly', () => {
    expect(parseTab('visual-control')).toBe('visual-control');
    expect(parseTab('visualControl')).toBe('overview');
    expect(parseTab('visual control')).toBe('overview');
    expect(parseTab('visual_control')).toBe('overview');
  });

  it('has exactly six valid tabs in the defined order', () => {
    expect(VALID_TABS).toEqual([
      'overview',
      'references',
      'prompts',
      'visual-control',
      'generations',
      'technical',
    ]);
  });
});

describe('ShotInspectorIA1 — tab URL generation', () => {
  it('generates a clean base URL for overview (default tab)', () => {
    expect(buildTabUrl('/projects/slug/shots/CODE', 'overview')).toBe('/projects/slug/shots/CODE');
  });

  it('generates a tab URL for each non-default tab', () => {
    const basePath = '/projects/slug/shots/CODE';
    expect(buildTabUrl(basePath, 'references')).toBe(`${basePath}?tab=references`);
    expect(buildTabUrl(basePath, 'prompts')).toBe(`${basePath}?tab=prompts`);
    expect(buildTabUrl(basePath, 'visual-control')).toBe(`${basePath}?tab=visual-control`);
    expect(buildTabUrl(basePath, 'generations')).toBe(`${basePath}?tab=generations`);
    expect(buildTabUrl(basePath, 'technical')).toBe(`${basePath}?tab=technical`);
  });

  it('preserves the base path structure', () => {
    const basePath = '/projects/my-proj/shots/EP01_SC01_SH001';
    expect(buildTabUrl(basePath, 'prompts')).toBe(`${basePath}?tab=prompts`);
  });
});

describe('ShotInspectorIA1 — tab labels', () => {
  it('has labels for all six tabs', () => {
    for (const tab of VALID_TABS) {
      expect(TAB_LABELS[tab]).toBeTruthy();
    }
  });

  it('has human-readable labels', () => {
    expect(TAB_LABELS.overview).toBe('Overview');
    expect(TAB_LABELS.references).toBe('References');
    expect(TAB_LABELS.prompts).toBe('Prompts');
    expect(TAB_LABELS['visual-control']).toBe('Visual Control');
    expect(TAB_LABELS.generations).toBe('Generations');
    expect(TAB_LABELS.technical).toBe('Technical');
  });
});

describe('ShotInspectorIA1 — accessibility metadata', () => {
  it('every tab has a non-empty label', () => {
    for (const tab of VALID_TABS) {
      expect(TAB_LABELS[tab].trim().length).toBeGreaterThan(0);
    }
  });

  it('the tab type includes all six values', () => {
    const all: TabValue[] = [...VALID_TABS];
    expect(all).toHaveLength(6);
  });
});
