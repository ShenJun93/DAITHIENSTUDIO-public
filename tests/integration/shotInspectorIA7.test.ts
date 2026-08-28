import { describe, expect, it } from 'vitest';
import pageSource from '@/app/projects/[slug]/shots/[code]/page.tsx?raw';
import technicalSource from '@/components/shot-inspector/TechnicalContent.tsx?raw';

describe('Shot Inspector IA7 — route/read-path integration', () => {
  it('Prompt provenance and asset lineage remain auditable', () => {
    expect(pageSource).toContain("activeTab === 'generations' || activeTab === 'technical'");
    expect(pageSource).toContain('loadAssetCompareReadCandidates(slug, workspaceAssets)');
    expect(pageSource).toContain('<TechnicalContent');
    expect(pageSource).toContain('packageFingerprint={vcReadModel?.packageFingerprint ?? null}');
    expect(pageSource).toContain('continuityFingerprint={vcReadModel?.continuity.fingerprint ?? null}');
    expect(pageSource).toContain('promptId: vcReadModel?.prompt.image.promptId ?? null');
    expect(pageSource).toContain('lockRefs: vcReadModel?.prompt.image.lockRefs ?? null');
    expect(pageSource).toContain('decisionRule={{ code: overviewAction.ruleId, message: overviewAction.reason }}');
    expect(pageSource).toContain('lineageHref: asset.lineageHref');
  });

  it('Creator-facing tabs remain free of new raw audit detail', () => {
    expect(pageSource).toContain("activeTab === 'technical' && (");
    expect(pageSource).toContain('<TechnicalContent');
    expect(pageSource).not.toContain('<Card title="Continuity environment">');
    expect(pageSource).not.toContain('<Card title="Continuity findings">');
    expect(pageSource).not.toContain('<Card title="Fingerprints">');
    expect(technicalSource).not.toContain('decideAssetAction');
    expect(technicalSource).not.toContain('checkQualityAction');
    expect(technicalSource).not.toContain('repinReferenceAction');
    expect(technicalSource).not.toContain('enqueueGeneration');
  });

  it('keeps technical audit scope inside the existing six-tab Shot Workspace', () => {
    expect(pageSource).toContain('id="shot-tabpanel-technical"');
    expect(pageSource).not.toContain('/technical/');
    expect(pageSource).not.toContain('createGenerationService');
    expect(pageSource).not.toContain('createAssetService');
  });
});
