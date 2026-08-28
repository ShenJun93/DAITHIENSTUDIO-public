import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ProjectWorkspaceError from '@/app/projects/[slug]/error';
import ProjectWorkspaceLoading from '@/app/projects/[slug]/loading';

Object.assign(globalThis, { React });

describe('TASK-Q03 project route boundaries coverage', () => {
  it('provides a labelled loading state for project routes', () => {
    const loading = renderToStaticMarkup(ProjectWorkspaceLoading());

    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('Loading the latest persisted project data…');
  });

  it('provides a recoverable route error with a stable operator code', () => {
    const error = renderToStaticMarkup(ProjectWorkspaceError({
      error: new Error('simulated route failure'),
      reset: () => undefined,
    }));

    expect(error).toContain('role="alert"');
    expect(error).toContain('PROJECT_ROUTE_FAILED');
    expect(error).toContain('<button');
    expect(error).toContain('Try again');
  });

  it('keeps global and project workspace navigation visible', () => {
    const globalLayout = readFileSync('src/app/layout.tsx', 'utf8');
    const projectLayout = readFileSync('src/app/projects/[slug]/layout.tsx', 'utf8');

    expect(globalLayout).toContain("label: 'Dashboard'");
    expect(globalLayout).toContain("label: 'Projects'");
    expect(projectLayout).toContain('aria-label="Project workspace"');
    expect(projectLayout).toContain("label: 'Overview'");
    expect(projectLayout).toContain("label: 'Timeline & Export'");
  });

  it('TASK-UI-CREATIVE-WORKSPACE-FOUNDATION-001 Slice 2: adds Character and Location Browser navigation without removing any Slice 1 destination', () => {
    const projectLayout = readFileSync('src/app/projects/[slug]/layout.tsx', 'utf8');

    // Slice 2 additions.
    expect(projectLayout).toContain("segment: '/workspace/characters', label: 'Characters'");
    expect(projectLayout).toContain("segment: '/workspace/locations', label: 'Locations'");

    // Every Slice 1 destination is still present (regression protection).
    for (const label of ['Overview', 'Story', 'Script', 'Bibles', 'Shots', 'Assets', 'Production', 'Voice', 'Sound', 'Continuity', 'Queue', 'Workflow', 'Timeline & Export']) {
      expect(projectLayout, `Slice 1 nav item "${label}" is missing`).toContain(`label: '${label}'`);
    }
  });

  it('Slice 2 does not duplicate the project workspace navigation system', () => {
    const projectLayout = readFileSync('src/app/projects/[slug]/layout.tsx', 'utf8');
    expect(projectLayout.match(/aria-label="Project workspace"/g)).toHaveLength(1);
    expect(projectLayout.match(/NAV_GROUPS/g)?.length).toBeGreaterThan(0);
  });

  it('TASK-UI-CREATIVE-WORKSPACE-FOUNDATION-001 Slice 3: adds Scene Board and Shot Storyboard navigation without removing any Slice 1 or Slice 2 destination', () => {
    const projectLayout = readFileSync('src/app/projects/[slug]/layout.tsx', 'utf8');

    // Slice 3 additions.
    expect(projectLayout).toContain("segment: '/workspace/scenes', label: 'Scenes'");
    expect(projectLayout).toContain("segment: '/workspace/shots', label: 'Storyboard'");

    // Every Slice 1 and Slice 2 destination is still present (regression protection).
    for (const label of [
      'Overview', 'Characters', 'Locations',
      'Story', 'Script', 'Bibles',
      'Shots', 'Assets', 'Production', 'Voice', 'Sound',
      'Continuity', 'Queue', 'Workflow', 'Timeline & Export',
    ]) {
      expect(projectLayout, `nav item "${label}" is missing`).toContain(`label: '${label}'`);
    }

    // Exactly one navigation system, still.
    expect(projectLayout.match(/aria-label="Project workspace"/g)).toHaveLength(1);
  });
});
