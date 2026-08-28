/**
 * VC2/VC3 — Visual Control section boundary (TASK-UI-VISUAL-CONTROL-001).
 *
 * A server component co-located with the Shot Inspector route (ADR-013) that
 * fetches the accepted VC1 read model for one shot via
 * `createVisualControlService(studio).overview()` behind a Suspense boundary.
 * For VC3 it ALSO assembles the `RepinData` handed to the section: the bound
 * `repinReferenceAction` server action (project-scoped by slug), the exact
 * bible snapshot versions that exist for each shot-field Character/Location/
 * Prop pin (from `bibles.listVersions` — the existing authority, so a repin
 * selector can never offer another entity's snapshot), entity display names,
 * and the read-only project-level Style review (from `projects.styleId`).
 * If the read model cannot be gathered, the section degrades to a read-only
 * error card so the rest of the Shot Inspector page is never blocked. No
 * writes happen here — repinning is performed by the bound server action. No
 * providers, no new route — `VisualControlSectionBoundary.tsx` is a co-located
 * module, not a route segment.
 */
import { Suspense } from 'react';
import { getStudio } from '@/infrastructure/container';
import { repinReferenceAction } from '@/app/actions';
import { createVisualControlService } from '@/application/services/visualControlService';
import type { Studio } from '@/application/ports';
import type { VisualControlState } from '@/domain/visualControl/types';
import { VisualControlSection } from '@/components/visual-control/VisualControlSection';
import { VisualControlLoading } from '@/components/visual-control/VisualControlLoading';
import { VisualControlError } from '@/components/visual-control/VisualControlError';
import {
  buildVersionOptions,
  type ProjectStyleReviewState,
  type RepinData,
  type RepinVersionOption,
} from '@/components/visual-control/visualControlRepin';

export function VisualControlSectionBoundary({ projectSlug, shotId }: { projectSlug: string; shotId: string }) {
  return (
    <Suspense fallback={<VisualControlLoading />}>
      <VisualControlEvidence projectSlug={projectSlug} shotId={shotId} />
    </Suspense>
  );
}

async function VisualControlEvidence({ projectSlug, shotId }: { projectSlug: string; shotId: string }) {
  const studio = getStudio();
  try {
    const state = await createVisualControlService(studio).overview(projectSlug, shotId);
    const repin = await assembleRepinData(studio, state, projectSlug);
    return <VisualControlSection shotCode={state.shotCode} state={state} repin={repin} />;
  } catch (caught) {
    return <VisualControlError reason={describeReadError(caught)} />;
  }
}

async function entityName(studio: Studio, kind: string, refId: string): Promise<string | null> {
  const entity =
    kind === 'character'
      ? await studio.bibles.characterById(refId)
      : kind === 'location'
        ? await studio.bibles.locationById(refId)
        : await studio.bibles.propById(refId);
  return entity?.name ?? null;
}

async function assembleRepinData(studio: Studio, state: VisualControlState, slug: string): Promise<RepinData> {
  const versionsByRef: Record<string, RepinVersionOption[]> = {};
  const names: Record<string, string> = {};

  for (const pin of state.pinnedReferences) {
    if (pin.source !== 'shot-field') continue;
    const key = `${pin.kind}:${pin.refId}`;
    const versions = await studio.bibles.listVersions(pin.kind, pin.refId);
    versionsByRef[key] = buildVersionOptions(
      pin.code,
      versions.map((version) => version.version),
    );
    names[key] = (await entityName(studio, pin.kind, pin.refId)) ?? pin.code;
  }

  const project = await studio.projects.byId(state.projectId);
  const styleId = project?.styleId ?? null;
  const style = styleId ? await studio.bibles.styleById(styleId) : null;
  const projectStyle: ProjectStyleReviewState = {
    isProjectLevel: true,
    styleId,
    code: style?.code ?? '',
    name: style?.name ?? '',
    currentVersion: style?.currentVersion ?? null,
    lockedVersionId: null,
    resolved: Boolean(style),
  };

  const action = repinReferenceAction.bind(null, slug, state.shotId);
  return { action, versionsByRef, names, projectStyle };
}

function describeReadError(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return String(caught);
}
