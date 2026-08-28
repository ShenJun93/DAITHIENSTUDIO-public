/**
 * Shot Workspace — existing Shot Inspector IA/VC capabilities composed around
 * persistent shot context, readiness, next action, and primary media.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createPromptService } from '@/application/services/promptService';
import { createContinuityService } from '@/application/services/continuityService';
import { createVisualControlService } from '@/application/services/visualControlService';
import { OverviewContent } from '@/components/shot-inspector/OverviewContent';
import {
  deriveNextAction,
  deriveReadinessGlyph,
  deriveReadinessTone,
} from '@/components/shot-inspector/overviewUtils';
import { ReferencesContent } from '@/components/shot-inspector/ReferencesContent';
import { PromptsContent } from '@/components/shot-inspector/PromptsContent';
import type { PreflightReadinessData } from '@/components/shot-inspector/preflightReadinessUtils';
import type { PromptReadData, ShotRefInputs } from '@/components/shot-inspector/promptHealthUtils';
import {
  buildVersionOptions,
  type ProjectStyleReviewState,
  type RepinData,
  type RepinVersionOption,
} from '@/components/visual-control/visualControlRepin';
import { EvidenceStatusBadge } from '@/components/visual-control/EvidenceStatusBadge';
import type { Studio } from '@/application/ports';
import type { VisualControlState } from '@/domain/visualControl/types';
import { estimateCostUsd } from '@/domain/cost';
import {
  checkQualityAction,
  decideAssetAction,
  deleteShotAction,
  repinReferenceAction,
} from '@/app/actions';
import { loadAssetCompareReadCandidates } from '@/app/assetCompareRead';
import { ShotInspectorHeader } from '@/components/shot-inspector/ShotInspectorHeader';
import { ShotInspectorTabs } from '@/components/shot-inspector/ShotInspectorTabs';
import { parseTab, type TabValue } from '@/components/shot-inspector/tabUtils';
import { VisualControlSectionBoundary } from './VisualControlSectionBoundary';
import { GenerationsContent } from '@/components/shot-inspector/GenerationsContent';
import { TechnicalContent } from '@/components/shot-inspector/TechnicalContent';

export const dynamic = 'force-dynamic';

const READINESS_LABELS = {
  READY: 'Ready',
  NEEDS_ATTENTION: 'Needs attention',
  BLOCKED: 'Blocked',
  IN_PROGRESS: 'In progress',
  COMPLETE: 'Complete',
} as const;

export default async function ShotPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string; code: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { slug, code } = await params;
  const { tab } = await searchParams;
  const activeTab: TabValue = parseTab(tab);

  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const shot = await studio.shots.byCode(project.id, decodeURIComponent(code));
  if (!shot) notFound();

  const promptService = createPromptService(studio);
  const [scene, imagePrompt, videoPrompt, generations, assets, continuity, sceneShots] = await Promise.all([
    studio.scenes.byId(shot.sceneId),
    promptService.latestForShot(shot.id, 'image'),
    promptService.latestForShot(shot.id, 'video'),
    studio.generations.listByShot(shot.id),
    studio.assets.list(project.id, { shotId: shot.id, limit: 50 }),
    createContinuityService(studio).forShot(shot.id),
    studio.shots.listByScene(shot.sceneId),
  ]);

  const sortedShots = [...sceneShots].sort((a, b) => (a.shotNumber ?? 0) - (b.shotNumber ?? 0));
  const currentIndex = sortedShots.findIndex((s) => s.id === shot.id);
  const previousShotCode = currentIndex > 0 ? (sortedShots[currentIndex - 1]?.code ?? null) : null;
  const nextShotCode = currentIndex >= 0 && currentIndex < sortedShots.length - 1 ? (sortedShots[currentIndex + 1]?.code ?? null) : null;

  const basePath = `/projects/${slug}/shots/${encodeURIComponent(shot.code)}`;

  let vcReadModel: VisualControlState | null = null;
  try {
    vcReadModel = await createVisualControlService(studio).overview(slug, shot.id);
  } catch {
    // Workspace remains usable with deterministic non-VC readiness fallback.
  }

  let referencesReadModel: VisualControlState | null = null;
  let referencesRepin: RepinData | null = null;
  if (activeTab === 'references') {
    referencesReadModel = vcReadModel;
    if (referencesReadModel) {
      try {
        referencesRepin = await assembleReferencesRepinData(studio, referencesReadModel, slug);
      } catch {
        referencesRepin = null;
      }
    }
  }

  const shotOverview = {
    code: shot.code,
    shotSize: shot.shotSize,
    cameraAngle: shot.cameraAngle,
    lens: shot.lens,
    durationSeconds: shot.durationSeconds,
    aspectRatio: shot.aspectRatio,
    description: shot.description,
    dialogue: shot.dialogue,
    lighting: shot.lighting,
    emotion: shot.emotion,
    importance: shot.importance,
  };

  const overviewAction = deriveNextAction({
    vcState: vcReadModel,
    shot: shotOverview,
    imagePrompt,
    videoPrompt,
    generations,
    assets,
    nextShotCode,
    basePath,
  });

  const overviewContent = (
    <OverviewContent action={overviewAction} shot={shotOverview} basePath={basePath} />
  );

  const promptReadData: { image: PromptReadData | null; video: PromptReadData | null } = {
    image: imagePrompt
      ? {
          compiled: imagePrompt.version.compiled,
          negative: imagePrompt.version.negative,
          lockRefs: imagePrompt.version.lockRefs,
          lint: imagePrompt.version.lint,
          version: imagePrompt.version.version,
          createdAt: imagePrompt.version.createdAt,
        }
      : null,
    video: videoPrompt
      ? {
          compiled: videoPrompt.version.compiled,
          negative: videoPrompt.version.negative,
          lockRefs: videoPrompt.version.lockRefs,
          lint: videoPrompt.version.lint,
          version: videoPrompt.version.version,
          createdAt: videoPrompt.version.createdAt,
        }
      : null,
  };

  const promptRefInputs: ShotRefInputs = {
    hasCharacters: shot.characters.length > 0,
    hasLocation: shot.locationId !== null,
    hasProps: shot.props.length > 0,
    hasProjectStyle: project.styleId !== null,
  };

  const promptIngredientsData = {
    characters: shot.characters.map((c) => ({
      characterId: c.characterId,
      versionId: c.versionId ?? '',
      name: undefined as string | undefined,
    })),
    location: shot.locationId
      ? { locationId: shot.locationId, versionId: shot.locationVersionId ?? '', name: undefined as string | undefined }
      : null,
    props: shot.props.map((p) => ({
      propId: p.propId,
      versionId: p.versionId ?? '',
      name: undefined as string | undefined,
    })),
    hasProjectStyle: project.styleId !== null,
    shotSize: shot.shotSize ?? '',
    cameraAngle: shot.cameraAngle ?? '',
    cameraMovement: typeof shot.cameraMovement === 'object'
      ? (shot.cameraMovement as { type: string }).type || ''
      : String(shot.cameraMovement ?? ''),
    lens: shot.lens ?? '',
    durationSeconds: shot.durationSeconds,
    aspectRatio: shot.aspectRatio ?? '',
    description: shot.description ?? '',
    dialogue: shot.dialogue ?? '',
    lighting: shot.lighting ?? '',
    emotion: shot.emotion ?? '',
  };

  const providerDescriptors = studio.providers.descriptors();
  const buildPreflightRow = (kind: 'image' | 'video', prompt: PromptReadData | null) => {
    const provider = studio.providers.defaultKeyFor(kind);
    const descriptor = providerDescriptors.find((candidate) => candidate.key === provider) ?? null;
    const model = descriptor?.models[kind]?.[0] ?? null;
    const capabilitySupported = kind === 'image'
      ? Boolean(descriptor?.capabilities.textToImage)
      : Boolean(descriptor?.capabilities.textToVideo);

    return {
      kind,
      provider,
      providerLabel: descriptor?.label ?? null,
      model,
      registered: descriptor !== null,
      offline: descriptor?.offline ?? false,
      capabilitySupported,
      estimatedCostUsd: estimateCostUsd({
        provider,
        kind,
        count: 1,
        durationSeconds: shot.durationSeconds,
        characters: prompt?.compiled.length ?? 0,
      }),
    };
  };

  const preflightReadiness: PreflightReadinessData = {
    image: buildPreflightRow('image', promptReadData.image),
    video: buildPreflightRow('video', promptReadData.video),
  };

  const imageGenerationRequest =
    imagePrompt && preflightReadiness.image.model
      ? {
          projectId: project.id,
          shotId: shot.id,
          promptId: imagePrompt.prompt.id,
          kind: 'image' as const,
          provider: preflightReadiness.image.provider,
          model: preflightReadiness.image.model,
          params: { count: 1 },
          referenceAssetIds: [],
          priority: 100,
        }
      : null;

  const videoGenerationRequest =
    videoPrompt && preflightReadiness.video.model
      ? {
          projectId: project.id,
          shotId: shot.id,
          promptId: videoPrompt.prompt.id,
          kind: 'video' as const,
          provider: preflightReadiness.video.provider,
          model: preflightReadiness.video.model,
          params: { durationSeconds: shot.durationSeconds },
          referenceAssetIds: [],
          priority: 100,
        }
      : null;

  const workspaceAssets = assets.map((asset) => ({
    ...asset,
    url: studio.storage.url(asset.storageKey),
  }));
  const needsAssetAuditRead = activeTab === 'generations' || activeTab === 'technical';
  const compareReadAssets = needsAssetAuditRead
    ? await loadAssetCompareReadCandidates(slug, workspaceAssets)
    : [];
  const compareAssets = compareReadAssets.map((asset) => ({
    ...asset,
    approveAction: decideAssetAction.bind(
      null,
      slug,
      asset.id,
      'approved',
      'Approved from Shot Inspector compare review.',
    ),
    rejectAction: decideAssetAction.bind(
      null,
      slug,
      asset.id,
      'rejected',
      'Rejected from Shot Inspector compare review.',
    ),
    qualityAction: checkQualityAction.bind(null, slug, asset.id),
  }));
  const previewableAssets = workspaceAssets.filter(
    (asset) => asset.mimeType.startsWith('image/') || asset.mimeType.startsWith('video/'),
  );
  const primaryAsset =
    previewableAssets.find((asset) => asset.approvalState === 'approved') ?? previewableAssets[0] ?? null;

  const generationsProps = {
    generations,
    assets: compareAssets,
    projectSlug: slug,
    imageGenerationRequest,
    videoGenerationRequest,
  };

  const technicalAssets = compareReadAssets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    lineageHref: asset.lineageHref,
  }));

  const readinessTone = deriveReadinessTone(overviewAction.readiness);
  const readinessGlyph = deriveReadinessGlyph(overviewAction.readiness);
  const readinessLabel = READINESS_LABELS[overviewAction.readiness];
  const workspaceActionDestination = activeTab === 'prompts' ? `${basePath}?tab=overview` : overviewAction.destination;
  const workspaceActionLabel = activeTab === 'prompts' ? 'Review next action' : overviewAction.primaryLabel;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <ShotInspectorHeader
        shotCode={shot.code}
        shotTitle={shot.title}
        sceneCode={scene?.code ?? null}
        importance={shot.importance}
        status={shot.status}
        projectSlug={slug}
        previousShotCode={previousShotCode}
        nextShotCode={nextShotCode}
        deleteAction={deleteShotAction.bind(null, slug, shot.sceneId, shot.id)}
        confirmMessage={`Delete shot ${shot.code}? Unapproved assets are removed; approved assets are kept in the project library. This cannot be undone.`}
      />

      <section
        aria-label="Shot workspace status"
        className="grid gap-4 rounded-xl border border-line bg-surface-1 p-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(17rem,0.8fr)]"
      >
        <div
          aria-label="Shot media stage"
          className="flex min-h-72 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 lg:min-h-[26rem]"
        >
          {primaryAsset?.mimeType.startsWith('image/') ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={primaryAsset.url}
              alt={primaryAsset.name || `${shot.code} primary asset`}
              className="max-h-[34rem] w-full object-contain"
            />
          ) : primaryAsset?.mimeType.startsWith('video/') ? (
            <video controls src={primaryAsset.url} className="max-h-[34rem] w-full" aria-label={`${shot.code} primary video`} />
          ) : (
            <div className="max-w-md px-6 text-center">
              <p className="text-sm font-semibold text-ink-hi">No preview asset yet</p>
              <p className="mt-2 text-sm text-ink-mid">
                This shot has no previewable image or video asset. Continue with the existing next action; generated assets will appear here without changing the shot workflow.
              </p>
            </div>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Shot readiness and next action">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-lo">Production state</p>
            <div className="mt-2">
              <EvidenceStatusBadge tone={readinessTone}>
                {readinessGlyph} {readinessLabel}
              </EvidenceStatusBadge>
            </div>
            <p className="mt-3 text-sm leading-6 text-ink-mid">{overviewAction.reason}</p>
          </div>

          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-lo">Next safe action</p>
            <Link
              href={workspaceActionDestination}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface-0 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2"
            >
              {workspaceActionLabel} →
            </Link>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink-lo">Scene</dt>
              <dd className="font-mono text-ink-hi">{scene?.code ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-lo">Position</dt>
              <dd className="text-ink-hi">{currentIndex >= 0 ? `${currentIndex + 1} / ${sortedShots.length}` : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-lo">Assets</dt>
              <dd className="text-ink-hi">{assets.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-lo">Generations</dt>
              <dd className="text-ink-hi">{generations.length}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <ShotInspectorTabs activeTab={activeTab} />

      <div role="tabpanel" id="shot-tabpanel-overview" aria-labelledby="shot-tab-overview" hidden={activeTab !== 'overview'}>
        {activeTab === 'overview' && overviewContent}
      </div>

      <div role="tabpanel" id="shot-tabpanel-references" aria-labelledby="shot-tab-references" hidden={activeTab !== 'references'}>
        {activeTab === 'references' && (
          <ReferencesContent
            pins={referencesReadModel ? referencesReadModel.pinnedReferences : null}
            approvedReferences={referencesReadModel ? referencesReadModel.approvedReferences : []}
            repin={referencesRepin}
            basePath={basePath}
          />
        )}
      </div>

      <div role="tabpanel" id="shot-tabpanel-prompts" aria-labelledby="shot-tab-prompts" hidden={activeTab !== 'prompts'}>
        {activeTab === 'prompts' && (
          <PromptsContent
            imageData={promptReadData.image}
            videoData={promptReadData.video}
            requiredRefs={promptRefInputs}
            ingredients={promptIngredientsData}
            basePath={basePath}
            preflight={preflightReadiness}
          />
        )}
      </div>

      <div role="tabpanel" id="shot-tabpanel-visual-control" aria-labelledby="shot-tab-visual-control" hidden={activeTab !== 'visual-control'}>
        {activeTab === 'visual-control' && <VisualControlSectionBoundary projectSlug={slug} shotId={shot.id} />}
      </div>

      <div role="tabpanel" id="shot-tabpanel-generations" aria-labelledby="shot-tab-generations" hidden={activeTab !== 'generations'}>
        {activeTab === 'generations' && <GenerationsContent {...generationsProps} />}
      </div>

      <div role="tabpanel" id="shot-tabpanel-technical" aria-labelledby="shot-tab-technical" hidden={activeTab !== 'technical'}>
        {activeTab === 'technical' && (
          <TechnicalContent
            continuityIn={shot.continuity.incoming}
            continuityOut={shot.continuity.outgoing}
            findings={continuity.findings}
            packageFingerprint={vcReadModel?.packageFingerprint ?? null}
            continuityFingerprint={vcReadModel?.continuity.fingerprint ?? null}
            prompts={[
              {
                kind: 'image',
                promptId: vcReadModel?.prompt.image.promptId ?? null,
                version: vcReadModel?.prompt.image.version ?? null,
                lockRefs: vcReadModel?.prompt.image.lockRefs ?? null,
              },
              {
                kind: 'video',
                promptId: vcReadModel?.prompt.video.promptId ?? null,
                version: vcReadModel?.prompt.video.version ?? null,
                lockRefs: vcReadModel?.prompt.video.lockRefs ?? null,
              },
            ]}
            decisionRule={{ code: overviewAction.ruleId, message: overviewAction.reason }}
            assets={technicalAssets}
          />
        )}
      </div>
    </div>
  );
}

async function referencesEntityName(studio: Studio, kind: string, refId: string): Promise<string | null> {
  const entity =
    kind === 'character'
      ? await studio.bibles.characterById(refId)
      : kind === 'location'
        ? await studio.bibles.locationById(refId)
        : await studio.bibles.propById(refId);
  return entity?.name ?? null;
}

async function assembleReferencesRepinData(
  studio: Studio,
  state: VisualControlState,
  slug: string,
): Promise<RepinData> {
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
    names[key] = (await referencesEntityName(studio, pin.kind, pin.refId)) ?? pin.code;
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
