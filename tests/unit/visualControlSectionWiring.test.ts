import { describe, expect, it } from 'vitest';
// Raw source text (Vite's built-in ?raw import) — proves wiring and
// regression-protects the additive integration without node:fs, which is
// off-limits outside src/infrastructure/**/scripts/**.
import projectShotPageSource from '@/app/projects/[slug]/shots/[code]/page.tsx?raw';
import boundarySource from '@/app/projects/[slug]/shots/[code]/VisualControlSectionBoundary.tsx?raw';
import sectionSource from '@/components/visual-control/VisualControlSection.tsx?raw';
import loadingSource from '@/components/visual-control/VisualControlLoading.tsx?raw';
import errorSource from '@/components/visual-control/VisualControlError.tsx?raw';
import repinControlSource from '@/components/visual-control/ReferenceRepinControl.tsx?raw';
import repinHelpersSource from '@/components/visual-control/visualControlRepin.ts?raw';
import projectStyleSource from '@/components/visual-control/ProjectStyleReview.tsx?raw';
import readinessEvidenceSource from '@/components/visual-control/readinessEvidence.ts?raw';
import continuityHelpersSource from '@/components/visual-control/visualContinuity.ts?raw';
import continuityPanelSource from '@/components/visual-control/VisualContinuityPanel.tsx?raw';
import featureSource from '../../docs/acceptance/visual-control.feature?raw';

const SECTION_SOURCES = [sectionSource, loadingSource, errorSource];

describe('visual control workspace shell — wiring and regression protection', () => {
  it('additively composes into the existing Shot Inspector page, with no new route', () => {
    expect(projectShotPageSource).toContain("import { VisualControlSectionBoundary } from './VisualControlSectionBoundary'");
    expect(projectShotPageSource).toContain('<VisualControlSectionBoundary projectSlug={slug} shotId={shot.id} />');
    // The boundary is a co-located module in the existing route folder, not a route segment.
    expect(projectShotPageSource).not.toContain("from '@/components/visual-control/VisualControlSection'");
    expect(boundarySource).not.toMatch(/^export (default|async function)/m);
    expect(boundarySource).not.toContain('notFound');
  });

  it('fetches the accepted VC1 read model once, through the existing service', () => {
    expect(boundarySource).toContain(
      "import { createVisualControlService } from '@/application/services/visualControlService'",
    );
    expect(boundarySource).toContain('createVisualControlService(studio)');
    expect(boundarySource).toContain('.overview(projectSlug, shotId)');
    expect(boundarySource).toContain('<VisualControlSection shotCode={state.shotCode} state={state} repin={repin} />');
    // IA2: The page now imports createVisualControlService for the Overview
    // tab's deterministic next-action derivation, gated by activeTab==='overview'.
    expect(projectShotPageSource).toContain('createVisualControlService');
    expect(projectShotPageSource).not.toContain('deriveReadinessEvidence');
  });

  it('assembles VC3 repin data server-side from the existing bible-version authorities and the repin action', () => {
    expect(boundarySource).toContain("import { repinReferenceAction } from '@/app/actions'");
    expect(boundarySource).toContain('repinReferenceAction.bind(null, slug, state.shotId)');
    expect(boundarySource).toContain('studio.bibles.listVersions(pin.kind, pin.refId)');
    expect(boundarySource).toContain('buildVersionOptions');
    expect(boundarySource).toContain('studio.projects.byId(state.projectId)');
    // No new repository or port method, no raw patch reaching the client.
    expect(boundarySource).toContain('assembleRepinData');
  });

  it('passes repin data into the section and keeps the project style review read-only', () => {
    expect(sectionSource).toContain("import { ProjectStyleReview } from './ProjectStyleReview'");
    expect(sectionSource).toContain('<ProjectStyleReview projectStyle={repin.projectStyle} />');
    expect(sectionSource).toContain('approvedReferences={state.approvedReferences}');
    expect(sectionSource).toContain('repin={repin}');
    expect(sectionSource).toContain("import type { RepinData } from './visualControlRepin'");
    // Style is project-level and read-only: no 'use client', no action, no form.
    expect(projectStyleSource).toContain('project-level');
    expect(projectStyleSource).not.toContain("'use client'");
    expect(projectStyleSource).not.toContain("from '@/app/");
  });

  it('routes the repin control through the bound server action only', () => {
    expect(repinControlSource).toContain("'use client'");
    expect(repinControlSource).toContain('await action(form)');
    expect(repinControlSource).toContain('window.confirm');
    // The control never imports the action, persistence or provider layers.
    expect(repinControlSource).not.toContain("from '@/app/");
    expect(repinControlSource).not.toContain("from '@/infrastructure/");
    expect(repinControlSource).not.toContain('drizzle-orm');
    expect(repinControlSource).not.toContain('better-sqlite3');
  });

  it('keeps the repin helpers pure and layer-clean', () => {
    expect(repinHelpersSource).not.toContain("from 'react'");
    expect(repinHelpersSource).not.toContain("from '@/app/");
    expect(repinHelpersSource).not.toContain("from '@/infrastructure/");
    expect(repinHelpersSource).toContain('isRepinChange');
    expect(repinHelpersSource).toContain('shouldConfirmRepin');
  });

  it('wraps the section in a Suspense boundary with the loading skeleton', () => {
    expect(boundarySource).toContain("import { Suspense } from 'react'");
    expect(boundarySource).toContain('Suspense');
    expect(boundarySource).toContain('fallback={<VisualControlLoading />}');
    expect(boundarySource).toContain("import { VisualControlLoading } from '@/components/visual-control/VisualControlLoading'");
  });

  it('isolates read failures so the Shot Inspector page is never blocked', () => {
    expect(boundarySource).toContain('try {');
    expect(boundarySource).toContain('catch (caught)');
    expect(boundarySource).toContain('<VisualControlError reason={describeReadError(caught)} />');
    expect(boundarySource).toContain("import { VisualControlError } from '@/components/visual-control/VisualControlError'");
  });

  it('composes every package evidence summary and the pure readiness derivation', () => {
    expect(sectionSource).toContain("from './readinessEvidence'");
    expect(sectionSource).toContain('deriveReadinessEvidence');
    expect(sectionSource).toContain("from './VisualSpecSummary'");
    expect(sectionSource).toContain("from './PinnedReferencesSummary'");
    expect(sectionSource).toContain("from './PromptReviewSummary'");
    expect(sectionSource).toContain("from './AssetReviewSummary'");
    expect(sectionSource).toContain("from './PackageSummary'");
  });

  it('consumes only the read model — no mutation, persistence, provider or route coupling', () => {
    const forbidden = [
      'setApproval',
      'decideAssetAction',
      'enqueueGeneration',
      'buildPromptForShotAction',
      'runWorkflow',
      'localStorage',
      'sessionStorage',
      'drizzle-orm',
      'better-sqlite3',
      'node:fs',
      'comfyui',
      'replicate',
      "from '@/app/",
      "from '@/infrastructure/",
    ];
    for (const source of SECTION_SOURCES) {
      for (const marker of forbidden) {
        expect(source, `marker "${marker}" is forbidden in the section source`).not.toContain(marker);
      }
    }
  });

  it('keeps the readiness derivation pure, typed against the VC1 domain read model', () => {
    expect(readinessEvidenceSource).toContain("import type { VisualControlState } from '@/domain/visualControl/types'");
    expect(readinessEvidenceSource).not.toContain("from 'react'");
    expect(readinessEvidenceSource).not.toContain('drizzle-orm');
    expect(readinessEvidenceSource).not.toContain('better-sqlite3');
  });

  it('composes the VC4 continuity panel additively and read-only', () => {
    expect(sectionSource).toContain("import { VisualContinuityPanel } from './VisualContinuityPanel'");
    expect(sectionSource).toContain('<VisualContinuityPanel state={state} />');
    // The panel is a server component fed by the accepted read model — no client
    // directives, no action, no persistence, no provider, no mutation controls.
    expect(continuityPanelSource).not.toContain("'use client'");
    expect(continuityPanelSource).not.toContain("from '@/app/");
    expect(continuityPanelSource).not.toContain("from '@/infrastructure/");
    expect(continuityPanelSource).not.toContain('drizzle-orm');
    expect(continuityPanelSource).not.toContain('better-sqlite3');
    expect(continuityPanelSource).not.toMatch(/<button|<form|<input|<select|<textarea/);
    expect(continuityPanelSource).not.toContain('onClick');
    expect(continuityPanelSource).not.toContain('onChange');
    expect(continuityPanelSource).not.toContain('onSubmit');
  });

  it('keeps the VC4 presentation helpers pure and layer-clean', () => {
    expect(continuityHelpersSource).not.toContain("from 'react'");
    expect(continuityHelpersSource).not.toContain("from '@/app/");
    expect(continuityHelpersSource).not.toContain("from '@/infrastructure/");
    expect(continuityHelpersSource).not.toContain('drizzle-orm');
    expect(continuityHelpersSource).not.toContain('better-sqlite3');
    expect(continuityHelpersSource).toContain('deriveContinuityComparison');
    expect(continuityHelpersSource).toContain('countFindingsBySeverity');
  });

  it('promotes VC2/VC3/VC4 and authorized VC8 scenarios while keeping VC5 standalone approval unpromoted', () => {
    expect(featureSource).toContain('operator can see shot visual readiness');
    expect(featureSource).toContain('operator can see the prompt for the exact shot, with exact versions');
    expect(featureSource).toContain('operator can see the reason each shot is not ready');
    expect(featureSource).toContain('operator can see pinned references per shot');
    expect(featureSource).toContain('operator can check the approved snapshot for each reference');
    expect(featureSource).toContain('operator can see continuity info (state vs finding)');
    expect(featureSource).toContain('operator can approve the exact shot visual package');
    expect(featureSource).toContain('a shot with a blocked/violating continuity finding cannot be approved');
    expect(featureSource).toContain('a shot with an unapproved reference cannot be approved');
    expect(featureSource).toContain('changing a shot field invalidates the approval');
    expect(featureSource).toContain('changing bible versions invalidates the approval');
    expect(featureSource).toContain('approving a new snapshot invalidates approval');
    expect(featureSource).toContain('approval is append-only (superseded by new approval, never deleted)');
    expect(featureSource).toContain('operator can see locked immutable approved package');
    expect(featureSource).not.toContain('approve/reject the exact prompt version');
  });
});
