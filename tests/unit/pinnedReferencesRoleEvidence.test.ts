import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PinnedReferencesSummary } from '@/components/visual-control/PinnedReferencesSummary';
import type { ApprovedReferenceState, PinnedReferenceState } from '@/domain/visualControl/types';

Object.assign(globalThis, { React });

const pins: PinnedReferenceState[] = [
  {
    kind: 'character',
    refId: 'char_1',
    code: 'CHAR001',
    versionId: 'CHAR001_V2',
    source: 'shot-field',
    resolved: true,
    resolvableReason: null,
  },
];

const approvedReferences: ApprovedReferenceState[] = [
  {
    kind: 'character',
    refId: 'char_1',
    versionId: 'CHAR001_V2',
    approvedAssetIds: ['ast_char_hero'],
    role: 'identity-anchor',
  },
];

describe('PinnedReferencesSummary VC7 role evidence', () => {
  it('shows the existing approved-reference role beside approved snapshot evidence', () => {
    const html = renderToStaticMarkup(
      React.createElement(PinnedReferencesSummary, { pins, approvedReferences }),
    );

    expect(html).toContain('approved snapshot');
    expect(html).toContain('CHAR001_V2');
    expect(html).toContain('identity-anchor');
  });
});
