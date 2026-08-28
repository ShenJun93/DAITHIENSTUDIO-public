import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EntityCard } from '@/components/creative-workspace/EntityCard';
import { InspectorPanel } from '@/components/creative-workspace/InspectorPanel';
import type { CreativeEntitySummary } from '@/application/services/creativeWorkspaceService';
import CharacterBrowserError from '@/app/projects/[slug]/workspace/characters/error';
import CharacterBrowserLoading from '@/app/projects/[slug]/workspace/characters/loading';
import LocationBrowserError from '@/app/projects/[slug]/workspace/locations/error';
import LocationBrowserLoading from '@/app/projects/[slug]/workspace/locations/loading';

Object.assign(globalThis, { React });

function characterFixture(overrides: Partial<CreativeEntitySummary> = {}): CreativeEntitySummary {
  return {
    kind: 'character',
    id: 'char-1',
    code: 'CHAR001',
    name: 'Triệu Ngốc',
    subtitle: 'lead',
    status: 'approved',
    lockEnabled: true,
    version: 2,
    updatedAt: '2026-07-01T00:00:00.000Z',
    sceneUsage: 3,
    shotUsage: 5,
    metadata: [{ label: 'Age range', value: 'young adult' }],
    warnings: [],
    ...overrides,
  };
}

function locationFixture(overrides: Partial<CreativeEntitySummary> = {}): CreativeEntitySummary {
  return {
    kind: 'location',
    id: 'loc-1',
    code: 'LOC001',
    name: 'Hang động tu tiên',
    subtitle: 'interior',
    status: 'draft',
    lockEnabled: null,
    version: 1,
    updatedAt: '2026-07-02T00:00:00.000Z',
    sceneUsage: 2,
    shotUsage: 4,
    metadata: [],
    warnings: [],
    ...overrides,
  };
}

describe('Character Browser and Location Browser cards', () => {
  it('Character Browser populated state: shows real character fields without a fabricated thumbnail', () => {
    const html = renderToStaticMarkup(React.createElement(EntityCard, { entity: characterFixture(), selected: false, onSelect: () => undefined }));
    expect(html).toContain('Triệu Ngốc');
    expect(html).toContain('CHAR001');
    expect(html).toContain('lead');
    expect(html).toContain('v2');
    expect(html).toContain('3'); // scene usage
    expect(html).toContain('5'); // shot usage
    expect(html).not.toContain('<img');
  });

  it('Location Browser populated state: shows real location fields', () => {
    const html = renderToStaticMarkup(React.createElement(EntityCard, { entity: locationFixture(), selected: false, onSelect: () => undefined }));
    expect(html).toContain('Hang động tu tiên');
    expect(html).toContain('LOC001');
    expect(html).toContain('interior');
  });

  it('lock visibility: shows Locked/Unlocked only when the entity kind supports it', () => {
    const lockedCharacter = renderToStaticMarkup(React.createElement(EntityCard, { entity: characterFixture({ lockEnabled: true }), selected: false, onSelect: () => undefined }));
    expect(lockedCharacter).toContain('Locked');

    const unlockedCharacter = renderToStaticMarkup(React.createElement(EntityCard, { entity: characterFixture({ lockEnabled: false }), selected: false, onSelect: () => undefined }));
    expect(unlockedCharacter).toContain('Unlocked');

    // Locations carry no lockEnabled concept in the domain model: no lock text is rendered at all.
    const location = renderToStaticMarkup(React.createElement(EntityCard, { entity: locationFixture(), selected: false, onSelect: () => undefined }));
    expect(location).not.toContain('Locked');
    expect(location).not.toContain('Unlocked');
  });

  it('unknown status fallback: an unrecognised status string renders safely instead of crashing or showing colour alone', () => {
    const html = renderToStaticMarkup(React.createElement(EntityCard, { entity: characterFixture({ status: 'not-a-real-status' }), selected: false, onSelect: () => undefined }));
    expect(html).toContain('not-a-real-status');
  });

  it('unsupported metadata omission: an empty metadata list renders no stray labels', () => {
    const html = renderToStaticMarkup(React.createElement(EntityCard, { entity: locationFixture({ metadata: [] }), selected: false, onSelect: () => undefined }));
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('selection state is exposed as an ARIA pressed state, and the accessible name is composed from real visible content, not a hand-written summary that could omit fields', () => {
    const unselected = renderToStaticMarkup(React.createElement(EntityCard, { entity: characterFixture(), selected: false, onSelect: () => undefined }));
    expect(unselected).toContain('aria-pressed="false"');
    expect(unselected).not.toContain('aria-label=');

    const selected = renderToStaticMarkup(React.createElement(EntityCard, { entity: characterFixture(), selected: true, onSelect: () => undefined }));
    expect(selected).toContain('aria-pressed="true"');
    // No manual aria-label: the button's accessible name comes from its own
    // text content, so subtitle/lock/usage are never hidden from assistive
    // technology behind a hand-written summary.
    expect(selected).not.toContain('aria-label=');
    expect(selected).toContain('lead');
    expect(selected).toContain('Locked');
  });
});

describe('Inspector', () => {
  it('Inspector shows status, lock, usage, metadata and a keyboard-reachable close control, with no destructive action', () => {
    const html = renderToStaticMarkup(React.createElement(InspectorPanel, { entity: characterFixture(), onClose: () => undefined }));
    expect(html).toContain('Inspector: Triệu Ngốc');
    expect(html).toContain('Age range');
    expect(html).toContain('young adult');
    expect(html).toContain('Scene usage');
    expect(html).toContain('Shot usage');
    expect(html).toContain('<button');
    expect(html).toContain('Close inspector');
    expect(html).not.toContain('Delete');
    expect(html).not.toContain('Approve');
    expect(html).not.toContain('Edit');
  });

  it('renders real warnings only when present, never a fabricated one', () => {
    const noWarnings = renderToStaticMarkup(React.createElement(InspectorPanel, { entity: characterFixture({ warnings: [] }), onClose: () => undefined }));
    expect(noWarnings).not.toContain('Warnings');

    const withWarning = renderToStaticMarkup(
      React.createElement(InspectorPanel, { entity: characterFixture({ lockEnabled: false, warnings: ['Lock disabled — this entry is not protected from further edits before generation.'] }), onClose: () => undefined }),
    );
    expect(withWarning).toContain('Lock disabled');
  });
});

describe('Character/Location Browser route boundaries', () => {
  it('Character Browser error state: recoverable with a stable operator code', () => {
    const html = renderToStaticMarkup(CharacterBrowserError({ error: new Error('simulated'), reset: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('CHARACTER_BROWSER_FAILED');
    expect(html).toContain('Try again');
  });

  it('Character Browser loading state: labelled and busy', () => {
    const html = renderToStaticMarkup(CharacterBrowserLoading());
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
  });

  it('Location Browser error state: recoverable with a stable operator code', () => {
    const html = renderToStaticMarkup(LocationBrowserError({ error: new Error('simulated'), reset: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('LOCATION_BROWSER_FAILED');
    expect(html).toContain('Try again');
  });

  it('Location Browser loading state: labelled and busy', () => {
    const html = renderToStaticMarkup(LocationBrowserLoading());
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
  });
});

describe('no project-specific hardcoding', () => {
  it('the entity browser components and routes contain no fixture/project-name literal', () => {
    const files = [
      'src/components/creative-workspace/EntityCard.tsx',
      'src/components/creative-workspace/InspectorPanel.tsx',
      'src/components/creative-workspace/EntityBrowserView.tsx',
      'src/app/projects/[slug]/workspace/characters/page.tsx',
      'src/app/projects/[slug]/workspace/locations/page.tsx',
      'src/application/services/creativeWorkspaceService.ts',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of ['Kianu', 'Pilot 002', 'Lục Vấn', 'Luc Van', 'Tuyết Đỉnh']) {
        expect(source, `${file} contains project-specific literal "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});
