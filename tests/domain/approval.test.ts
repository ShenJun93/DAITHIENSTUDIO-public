import { describe, expect, it } from 'vitest';
import {
  assertAssetDecisionAllowed,
  deriveShotStatusAfterAssetDecision,
  type AssetApprovalEvidence,
} from '@/domain/approval';

const cleanLint = { ok: true, score: 100, issues: [], characterCount: 120 };

function evidence(overrides: Partial<AssetApprovalEvidence> = {}): AssetApprovalEvidence {
  return {
    assetId: 'ast_candidate_1',
    currentState: 'pending',
    decision: 'approved',
    quality: { assetId: 'ast_candidate_1', passed: true },
    generationId: 'gen_candidate_1',
    promptVersion: { promptId: 'prm_image_1', version: 1, lint: cleanLint },
    ...overrides,
  };
}

describe('asset approval invariants', () => {
  it('requires QC for the exact asset before approval', () => {
    expect(() => assertAssetDecisionAllowed(evidence({ quality: null }))).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
    expect(() => assertAssetDecisionAllowed(evidence({ quality: { assetId: 'ast_other', passed: true } }))).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
  });

  it('requires clean lint on the exact generation-pinned prompt', () => {
    expect(() => assertAssetDecisionAllowed(evidence({ promptVersion: null }))).toThrowError(
      expect.objectContaining({ code: 'MISSING_REFERENCE' }),
    );
    expect(() => assertAssetDecisionAllowed(evidence({
      promptVersion: {
        promptId: 'prm_image_1',
        version: 1,
        lint: {
          ok: false,
          score: 80,
          characterCount: 120,
          issues: [{ rule: 'missing-lock', severity: 'error', message: 'Missing lock.', hint: 'Pin it.' }],
        },
      },
    }))).toThrowError(expect.objectContaining({ code: 'PROMPT_LINT_BLOCKED' }));
  });

  it('treats repeated approval as idempotent and keeps approved assets immutable', () => {
    expect(assertAssetDecisionAllowed(evidence({ currentState: 'approved' }))).toEqual({ idempotent: true });
    expect(() => assertAssetDecisionAllowed(evidence({ currentState: 'approved', decision: 'rejected' }))).toThrowError(
      expect.objectContaining({ code: 'IMMUTABLE_APPROVED_ASSET' }),
    );
  });

  it('does not treat changes requested on a pending asset as idempotent', () => {
    expect(assertAssetDecisionAllowed(evidence({ decision: 'changes-requested' }))).toEqual({ idempotent: false });
  });

  it('derives shot status from every candidate instead of the last decision alone', () => {
    expect(deriveShotStatusAfterAssetDecision('approved', ['approved', 'rejected'])).toBe('approved');
    expect(deriveShotStatusAfterAssetDecision('review', ['rejected', 'pending'])).toBe('review');
    expect(deriveShotStatusAfterAssetDecision('review', ['rejected', 'rejected'])).toBe('rejected');
  });
});
