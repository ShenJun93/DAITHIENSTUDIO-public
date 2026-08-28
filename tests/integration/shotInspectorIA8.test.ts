import { describe, expect, it } from 'vitest';
import pageSource from '@/app/projects/[slug]/shots/[code]/page.tsx?raw';
import promptsSource from '@/components/shot-inspector/PromptsContent.tsx?raw';
import preflightSource from '@/components/shot-inspector/PreflightReadiness.tsx?raw';
import preflightUtilsSource from '@/components/shot-inspector/preflightReadinessUtils.ts?raw';
import registrySource from '@/infrastructure/providers/registry.ts?raw';

describe('Shot Inspector IA8 — read-only provider-safe preflight readiness', () => {
  it('Mock baseline is explicit and zero-credit', () => {
    expect(preflightUtilsSource).toContain('OFFLINE / ZERO-CREDIT');
    expect(preflightSource).toContain('Read-only readiness only');
  });

  it('Non-mock risk is explicit without execution authorization', () => {
    expect(preflightUtilsSource).toContain('CANARY / PAID-RISK');
    expect(preflightSource).toContain('does not authorize generation');
  });

  it('Capability mismatch is visible from descriptor truth', () => {
    expect(pageSource).toContain('studio.providers.descriptors()');
    expect(pageSource).toContain('capabilities.textToImage');
    expect(pageSource).toContain('capabilities.textToVideo');
    expect(preflightUtilsSource).toContain('Capability mismatch');
    expect(pageSource).not.toContain('studio.providers.image(');
    expect(pageSource).not.toContain('studio.providers.video(');
  });

  it('Canonical estimated request cost is visible', () => {
    expect(pageSource).toContain("import { estimateCostUsd } from '@/domain/cost'");
    expect(pageSource).toContain('estimatedCostUsd: estimateCostUsd({');
    expect(preflightSource).toContain('Estimated request cost');
    expect(preflightSource).toContain('estimate');
  });

  it('No false exact remaining-budget truth is introduced', () => {
    expect(preflightSource).toContain('No exact remaining-budget value is approximated here');
    expect(pageSource).not.toContain('encumberedSpend');
    expect(pageSource).not.toContain('remainingBudget');
  });

  it('Existing prompt blockers remain explanatory rather than authoritative execution gates', () => {
    expect(promptsSource).toContain('derivePromptHealth');
    expect(promptsSource).toContain('<PreflightReadiness data={preflight} promptHealth={health} />');
    expect(preflightSource).toContain('Existing prompt readiness');
  });

  it('Preflight interactions are zero-credit and zero-mutation', () => {
    expect(preflightSource).not.toContain('fetch(');
    expect(preflightSource).not.toContain('<form');
    expect(preflightSource).not.toContain('ActionButton');
    expect(preflightSource).not.toContain('enqueueGeneration');
    expect(preflightSource).not.toContain('ServerAction');
    expect(pageSource).not.toContain('enqueueGenerationAction');
  });

  it('Existing Shot Inspector workflow remains structurally intact', () => {
    expect(pageSource).toContain('<OverviewContent');
    expect(pageSource).toContain('<ReferencesContent');
    expect(pageSource).toContain('<PromptsContent');
    expect(pageSource).toContain('<VisualControlSectionBoundary');
    expect(pageSource).toContain('<GenerationsContent');
    expect(pageSource).toContain('<TechnicalContent');
    expect(registrySource).toContain('descriptors(): ProviderDescriptor[]');
  });
});
