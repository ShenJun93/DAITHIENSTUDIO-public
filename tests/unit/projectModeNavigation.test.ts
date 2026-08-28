import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PROJECT_MODE_PREFERENCE_KEY,
  ProjectModeNavigation,
  parseProjectModePreference,
  visibleProjectNavGroups,
  type ProjectNavGroup,
} from '@/components/creative-workspace/ProjectModeNavigation';

Object.assign(globalThis, { React });

const groups: ProjectNavGroup[] = [
  { label: 'Workspace', items: [{ segment: '', label: 'Overview' }] },
  { label: 'Develop', items: [{ segment: '/story', label: 'Story' }] },
  { label: 'Produce', items: [{ segment: '/assets', label: 'Assets' }] },
  {
    label: 'Finish',
    items: [
      { segment: '/continuity', label: 'Continuity' },
      { segment: '/workflow', label: 'Workflow' },
      { segment: '/export', label: 'Timeline & Export' },
    ],
  },
];

describe('project mode navigation', () => {
  it('Guided Mode is the default presentation with no prior preference set', () => {
    expect(PROJECT_MODE_PREFERENCE_KEY).toMatch(/preference/i);
    expect(parseProjectModePreference(null)).toBe('guided');
    expect(parseProjectModePreference('unexpected')).toBe('guided');

    const html = renderToStaticMarkup(
      React.createElement(ProjectModeNavigation, { slug: 'demo', groups }),
    );

    for (const label of ['Workspace', 'Develop', 'Produce', 'Finish']) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).not.toContain('>Workflow<');
  });

  it('Advanced Mode entry exposes the full existing project navigation without hiding it in Guided Mode', () => {
    const guided = visibleProjectNavGroups(groups, 'guided');
    const advanced = visibleProjectNavGroups(groups, 'advanced');

    expect(guided.map((group) => group.label)).toEqual(['Workspace', 'Develop', 'Produce', 'Finish']);
    expect(advanced.map((group) => group.label)).toEqual(['Workspace', 'Develop', 'Produce', 'Finish']);

    expect(guided.flatMap((group) => group.items).map((item) => item.label)).toEqual([
      'Overview',
      'Story',
      'Assets',
      'Continuity',
      'Timeline & Export',
    ]);
    expect(advanced.flatMap((group) => group.items).map((item) => item.label)).toEqual([
      'Overview',
      'Story',
      'Assets',
      'Continuity',
      'Workflow',
      'Timeline & Export',
    ]);
  });
});
