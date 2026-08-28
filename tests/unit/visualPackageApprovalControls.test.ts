import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VisualControlSection } from '@/components/visual-control/VisualControlSection';
import type { VisualControlState } from '@/domain/visualControl/types';

Object.assign(globalThis, { React });

const state: VisualControlState = {
  projectId: 'prj_1',
  projectSlug: 'demo',
  shotId: 'shot_1',
  shotCode: 'S001',
  visualSpec: {
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'static' },
    lens: '50mm',
    durationSeconds: 5,
    lighting: 'soft',
    importance: 'normal',
    dialogue: '',
    emotion: 'calm',
    continuityIn: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'front', damagedObjects: [] } },
    continuityOut: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'front', damagedObjects: [] } },
    intentionalChanges: [],
  },
  pinnedReferences: [
    { kind: 'character', refId: 'char_1', code: 'CHAR001', versionId: 'CHAR001_V1', source: 'shot-field', resolved: true, resolvableReason: null },
  ],
  approvedReferences: [
    { kind: 'character', refId: 'char_1', versionId: 'CHAR001_V1', approvedAssetIds: ['ast_1'], role: 'identity-anchor' },
  ],
  prompt: {
    image: { kind: 'image', promptId: 'prm_1', version: 1, compiled: 'hero portrait', negative: '', lintOk: true, lintScore: 100, lockRefs: { characters: [], props: [], location: null, style: null } },
    video: { kind: 'video', promptId: null, version: null, compiled: null, negative: null, lintOk: null, lintScore: null, lockRefs: null },
  },
  assets: [
    { assetId: 'ast_1', kind: 'character', name: 'Hero anchor', approvalState: 'approved', boundRole: 'identity-anchor', isRequiredReference: true, contributesToReadiness: true },
  ],
  continuity: { previousShotCode: null, nextShotCode: null, findings: [], blockers: [], content: [], fingerprint: 'continuity-fp' },
  packageFingerprint: 'package-fp-current',
};

describe('Visual Control VC8 package approval controls', () => {
  it('operator can approve the exact shot visual package', () => {
    const html = renderToStaticMarkup(React.createElement(VisualControlSection, { shotCode: 'S001', state }));

    expect(html).toContain('Approve visual package');
    expect(html).toContain('package-fp-current');
    expect(html).not.toContain('Provider execution authorized');
  });
});
