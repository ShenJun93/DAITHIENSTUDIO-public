import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

Object.assign(globalThis, { React });

const layoutSource = readFileSync('src/app/projects/[slug]/layout.tsx', 'utf8');

const ALL_NAV_LABELS = [
  'Overview',
  'Characters',
  'Locations',
  'Scenes',
  'Storyboard',
  'Story',
  'Script',
  'Bibles',
  'Shots',
  'Assets',
  'Production',
  'Voice',
  'Sound',
  'Continuity',
  'Queue',
  'Workflow',
  'Timeline & Export',
];

const NAV_GROUPS = ['Workspace', 'Develop', 'Produce', 'Finish'];

describe('TASK-FIX-PROJECT-NAV-OVERFLOW-001 — overflow containment', () => {
  it('nav element includes overflow-x-auto for contained horizontal scroll', () => {
    const navMatch = layoutSource.match(/<nav[^>]*aria-label="Project workspace"[^>]*className="([^"]*)"/);
    expect(navMatch).not.toBeNull();
    expect(navMatch![1]).toContain('overflow-x-auto');
  });

  it('preserves semantic nav element with accessible label', () => {
    expect(layoutSource).toContain('aria-label="Project workspace"');
    expect(layoutSource).toMatch(/<nav\s/);
  });

  it('all 17 nav destinations remain present', () => {
    for (const label of ALL_NAV_LABELS) {
      expect(layoutSource, `nav destination "${label}" is missing`).toContain(`label: '${label}'`);
    }
  });

  it('all four nav groups remain present in correct order', () => {
    for (const group of NAV_GROUPS) {
      expect(layoutSource, `nav group "${group}" is missing`).toContain(`label: '${group}'`);
    }
    const workspaceIdx = layoutSource.indexOf("label: 'Workspace'");
    const developIdx = layoutSource.indexOf("label: 'Develop'");
    const produceIdx = layoutSource.indexOf("label: 'Produce'");
    const finishIdx = layoutSource.indexOf("label: 'Finish'");
    expect(workspaceIdx).toBeLessThan(developIdx);
    expect(developIdx).toBeLessThan(produceIdx);
    expect(produceIdx).toBeLessThan(finishIdx);
  });

  it('no nav destination is conditionally hidden or removed', () => {
    expect(layoutSource).not.toMatch(/display:\s*none/);
    expect(layoutSource).not.toMatch(/hidden\s+&&/);
  });

  it('does not introduce JavaScript viewport state or persistence', () => {
    expect(layoutSource).not.toContain('localStorage');
    expect(layoutSource).not.toContain('sessionStorage');
    expect(layoutSource).not.toContain('indexedDB');
    expect(layoutSource).not.toContain('useState');
    expect(layoutSource).not.toContain('useEffect');
    expect(layoutSource).not.toContain('innerWidth');
    expect(layoutSource).not.toContain('matchMedia');
  });

  it('does not introduce new routes or modify Shot Inspector source', () => {
    expect(layoutSource).not.toContain('shots/[code]');
    expect(layoutSource).not.toContain('tab=');
  });

  it('preserves whitespace-nowrap on links to prevent text wrapping', () => {
    expect(layoutSource).toContain('whitespace-nowrap');
  });

  it('has exactly one project workspace navigation', () => {
    expect(layoutSource.match(/aria-label="Project workspace"/g)).toHaveLength(1);
  });
});
