import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AssetCompareReview,
  CandidatePanel,
  toggleComparisonSelection,
  type AssetCompareCandidate,
} from '@/components/shot-inspector/AssetCompareReview';
import source from '@/components/shot-inspector/AssetCompareReview.tsx?raw';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

Object.assign(globalThis, { React });

const action = async () => ({ ok: true as const, message: 'saved' });
const candidates: AssetCompareCandidate[] = [1, 2, 3].map((number) => ({
  id: `ast_candidate_${number}`,
  name: `Candidate ${number}`,
  kind: 'image',
  mimeType: 'image/png',
  sizeBytes: 1024,
  url: `/storage/candidate-${number}.png`,
  version: 1,
  checksum: `${number}`.repeat(64),
  approvalState: number === 1 ? 'approved' : 'pending',
  generation: { id: `gen_${number}`, provider: 'mock', model: 'mock-image-v1', actualCostUsd: 0.01, promptId: 'prm_1', promptVersion: 1 },
  prompt: { id: 'prm_1', version: 1, lintOk: true, blockingFindingCount: 0 },
  quality: { id: `qr_${number}`, score: 100, passed: true, createdAt: '2026-08-08T00:00:00.000Z' },
  approval: number === 1 ? { decision: 'approved', note: 'winner', decidedBy: 'operator', createdAt: '2026-08-08T00:00:00.000Z' } : null,
  lineageHref: `/projects/demo/assets?focus=ast_candidate_${number}`,
  approveAction: action,
  rejectAction: action,
  qualityAction: action,
}));

describe('AssetCompareReview', () => {
  it('renders real selectable candidates and explains transient two-candidate selection', () => {
    const html = renderToStaticMarkup(React.createElement(AssetCompareReview, { candidates }));
    expect(html).toContain('Select up to two real assets');
    expect(html).toContain('Selection is temporary');
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toContain('0/2 candidates selected');
    expect(html).toContain('Asset ast_candidate_1');
  });

  it('selects, deselects and caps comparison state at two candidates', () => {
    expect(toggleComparisonSelection([], 'a')).toEqual(['a']);
    expect(toggleComparisonSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleComparisonSelection(['a', 'b'], 'c')).toEqual(['a', 'b']);
    expect(toggleComparisonSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('renders pending candidate provenance and review controls', () => {
    const html = renderToStaticMarkup(React.createElement(CandidatePanel, { candidate: candidates[1]! }));
    expect(html).toContain('gen_2');
    expect(html).toContain('mock/mock-image-v1');
    expect(html).toContain('$0.0100');
    expect(html).toContain('prm_1 v1');
    expect(html).toContain('Passed');
    expect(html).toContain('Approve');
    expect(html).toContain('Reject');
    expect(html).toContain('Run QC');
  });

  it('renders approval evidence without destructive review controls for an approved candidate', () => {
    const html = renderToStaticMarkup(React.createElement(CandidatePanel, { candidate: candidates[0]! }));
    expect(html).toContain('approved · operator');
    expect(html).toContain('Approved assets are immutable');
    expect(html).not.toContain('>Reject<');
    expect(html).not.toContain('>Run QC<');
  });

  it('implements an accessible two-column comparison with exact review controls and metadata', () => {
    expect(source).toContain('current.length >= limit');
    expect(source).toContain('lg:grid-cols-2');
    expect(source).toContain('Provider / model');
    expect(source).toContain('Pinned prompt');
    expect(source).toContain('Prompt lint');
    expect(source).toContain('Actual cost');
    expect(source).toContain('Quality');
    expect(source).toContain('Decision');
    expect(source).toContain('Lineage →');
    expect(source).toContain('candidate.approveAction');
    expect(source).toContain('candidate.rejectAction');
    expect(source).toContain('disabled={!approvalReady}');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('sessionStorage');
  });
});
