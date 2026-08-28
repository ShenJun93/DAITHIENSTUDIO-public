import { createContinuityService } from './continuityService';
import { createCreativeWorkspaceService, type CreativeShotMediaEvidence } from './creativeWorkspaceService';
import { createEpisodeService } from './episodeService';
import { createExportService } from './exportService';
import { createPublishService } from './publishService';
import {
  deriveJourneyCapabilityStages,
  type JourneyCapabilityStage,
} from './productionJourneyAdaptation';
import type { Studio } from '../ports';
import type { CapabilityKey } from '@/domain/capability';
import type { ProductionType, ProjectStatus } from '@/domain/enums';

export type JourneyPhase = 'setup' | 'develop' | 'plan' | 'produce' | 'review' | 'finish';
export const JOURNEY_PHASES: readonly JourneyPhase[] = ['setup', 'develop', 'plan', 'produce', 'review', 'finish'];
export type JourneyPhaseStateValue = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY' | 'BLOCKED' | 'COMPLETE';
export type JourneyIssueSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

export interface JourneyIssue {
  id: string;
  severity: JourneyIssueSeverity;
  phase: JourneyPhase;
  message: string;
  reason: string;
  evidenceSource: string;
  affectedEntity: { kind: string; id: string; label: string } | null;
  targetRoute: string;
  blocksPhase: boolean;
}

export interface JourneyAction {
  id: string;
  label: string;
  reason: string;
  targetRoute: string;
  phase: JourneyPhase;
  priority: number;
  blocking: boolean;
  evidenceSource: string;
}

export interface JourneyPhaseState {
  phase: JourneyPhase;
  state: JourneyPhaseStateValue;
  progress: number | null;
  blockers: JourneyIssue[];
  warnings: JourneyIssue[];
  nextActions: JourneyAction[];
}

export interface ProductionJourneyState {
  projectId: string;
  projectSlug: string;
  activeEpisodeId: string | null;
  /** Real service reads always populate these; optional keeps older presentation fixtures source-compatible. */
  productionType?: ProductionType | null;
  capabilityStages?: JourneyCapabilityStage[];
  phases: JourneyPhaseState[];
  currentPhase: JourneyPhase;
  primaryAction: JourneyAction | null;
  secondaryActions: JourneyAction[];
  blockers: JourneyIssue[];
  warnings: JourneyIssue[];
  computedAt: string;
}

const JOURNEY_ROUTE_SUFFIXES = [
  '', '/story', '/script', '/bibles', '/scenes', '/shots', '/production', '/assets', '/queue', '/continuity', '/export',
] as const;
const JOURNEY_GLOBAL_ROUTES = ['/providers'] as const;

export function projectRoute(slug: string, suffix: (typeof JOURNEY_ROUTE_SUFFIXES)[number] = ''): string {
  return `/projects/${slug}${suffix}`;
}

export function isKnownJourneyRoute(route: string, slug: string): boolean {
  if ((JOURNEY_GLOBAL_ROUTES as readonly string[]).includes(route)) return true;
  return JOURNEY_ROUTE_SUFFIXES.some((suffix) => route === projectRoute(slug, suffix));
}

export interface JourneyEvidenceWarning {
  key: string;
  label: string;
  detail: string;
  href: string;
}

export interface JourneyEvidenceContinuityFinding {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  shotCodes: string[];
}

export interface JourneyEvidenceShot {
  promptCount: number;
  assetCoverage: { total: number; approved: number };
  /** Real gathered evidence always populates this; optional keeps Slice-1 unit fixtures compatible. */
  mediaEvidence?: CreativeShotMediaEvidence;
}

export interface JourneyEvidence {
  projectId: string;
  projectSlug: string;
  activeEpisodeId: string | null;
  /** Presence is significant: explicit null means a real legacy project still needs a Production Type. */
  productionType?: ProductionType | null;
  projectStatus?: ProjectStatus;
  capabilityStages?: JourneyCapabilityStage[];
  episodeCount: number;
  scenesCount: number;
  shotsCount: number;
  shots: JourneyEvidenceShot[];
  pendingAssets: number;
  approvedAssets: number;
  readyForCompose: boolean;
  readyShots: number;
  totalShots: number;
  missingAnchors: number;
  hasTimeline?: boolean;
  warnings: JourneyEvidenceWarning[];
  continuityFindings: JourneyEvidenceContinuityFinding[];
  exportsCount: number;
  latestPublishStatus: 'pending' | 'running' | 'completed' | 'failed' | null;
  /** Deprecated Slice-1 fixture compatibility only. Real gathered evidence never sets this field. */
  providerCanGenerate?: boolean;
  computedAt: string;
}

export async function gatherJourneyEvidence(
  studio: Studio,
  projectIdOrSlug: string,
  episodeId?: string,
): Promise<JourneyEvidence> {
  const workspace = createCreativeWorkspaceService(studio);
  const episodeReader = createEpisodeService({ episodes: studio.episodes });
  const continuity = createContinuityService(studio);
  const exportsReader = createExportService(studio);
  const publishesReader = createPublishService(studio);

  const overview = await workspace.overview(projectIdOrSlug, episodeId);
  const [episodeList, shotBoard, continuityReport, exportList] = await Promise.all([
    episodeReader.listEpisodes(overview.project.id),
    workspace.shotStoryboard(projectIdOrSlug, episodeId),
    continuity.forProject(overview.project.id),
    exportsReader.list(overview.project.slug),
  ]);
  const publishList = await publishesReader.list(overview.project.id);
  const latestPublish = [...publishList].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];

  const productionType = overview.productionType;
  const projectStatus = overview.project.status as ProjectStatus;
  const capabilityStages = deriveJourneyCapabilityStages({
    productionType,
    projectStatus,
    providerDescriptors: studio.providers.descriptors(),
  });

  return {
    projectId: overview.project.id,
    projectSlug: overview.project.slug,
    activeEpisodeId: overview.activeEpisodeId,
    productionType,
    projectStatus,
    capabilityStages,
    episodeCount: episodeList.length,
    scenesCount: overview.counts.scenes,
    shotsCount: overview.counts.shots,
    shots: shotBoard.shots.map((shot) => ({
      promptCount: shot.promptCount,
      assetCoverage: shot.assetCoverage,
      mediaEvidence: shot.mediaEvidence,
    })),
    pendingAssets: overview.counts.pendingAssets,
    approvedAssets: overview.counts.approvedAssets,
    readyForCompose: overview.readiness.readyForCompose,
    readyShots: overview.readiness.readyShots,
    totalShots: overview.readiness.totalShots,
    missingAnchors: overview.readiness.missingAnchors,
    hasTimeline: Boolean(overview.hasTimeline),
    warnings: overview.warnings,
    continuityFindings: continuityReport.findings,
    exportsCount: exportList.length,
    latestPublishStatus: latestPublish?.status ?? null,
    computedAt: studio.clock.nowIso(),
  };
}

const WARNING_SEVERITY: Record<string, { phase: JourneyPhase; severity: JourneyIssueSeverity }> = {
  'script-empty': { phase: 'develop', severity: 'BLOCKER' },
  'script-unparsed': { phase: 'develop', severity: 'BLOCKER' },
  scenes: { phase: 'plan', severity: 'WARNING' },
  shots: { phase: 'plan', severity: 'WARNING' },
  anchors: { phase: 'plan', severity: 'BLOCKER' },
  'shot-media': { phase: 'produce', severity: 'WARNING' },
  'asset-review': { phase: 'review', severity: 'WARNING' },
  'generation-failures': { phase: 'produce', severity: 'BLOCKER' },
};

function explicitProductionType(evidence: JourneyEvidence): boolean {
  return Object.prototype.hasOwnProperty.call(evidence, 'productionType');
}

function stageByKey(evidence: JourneyEvidence, key: CapabilityKey): JourneyCapabilityStage | undefined {
  return evidence.capabilityStages?.find((stage) => stage.key === key);
}

function mediaFor(shot: JourneyEvidenceShot, kind: 'image' | 'video') {
  return shot.mediaEvidence?.[kind] ?? {
    promptCount: 0,
    generationCount: 0,
    failedGenerationCount: 0,
    assetTotal: 0,
    approvedAssets: 0,
  };
}

function generationWorkNeeded(evidence: JourneyEvidence, kind: 'image' | 'video'): boolean {
  return evidence.shots.some((shot) => {
    const media = mediaFor(shot, kind);
    return media.promptCount > 0 && media.approvedAssets === 0;
  });
}

function generationStageHasPrompt(evidence: JourneyEvidence, key: CapabilityKey): boolean {
  if (key === 'generation.image.submit') return evidence.shots.some((shot) => mediaFor(shot, 'image').promptCount > 0);
  if (key === 'generation.video.submit') return evidence.shots.some((shot) => mediaFor(shot, 'video').promptCount > 0);
  return false;
}

function requiredGenerationStages(evidence: JourneyEvidence): JourneyCapabilityStage[] {
  return (evidence.capabilityStages ?? []).filter(
    (stage) => stage.applicability === 'REQUIRED' &&
      (stage.key === 'generation.image.submit' || stage.key === 'generation.video.submit'),
  );
}

function requiredGenerationComplete(evidence: JourneyEvidence): boolean {
  const required = requiredGenerationStages(evidence);
  if (required.length === 0 || evidence.shots.length === 0) return false;
  return required.every((stage) => {
    const kind = stage.key === 'generation.image.submit' ? 'image' : 'video';
    return evidence.shots.every((shot) => {
      const media = mediaFor(shot, kind);
      return media.promptCount > 0 && media.approvedAssets > 0;
    });
  });
}

function blockingContinuityErrors(evidence: JourneyEvidence): number {
  const stage = stageByKey(evidence, 'continuity.check');
  if (stage?.applicability === 'OPTIONAL' || stage?.applicability === 'NOT_APPLICABLE') return 0;
  return evidence.continuityFindings.filter((finding) => finding.severity === 'error').length;
}

function adaptedReviewComplete(evidence: JourneyEvidence): boolean {
  if (!requiredGenerationComplete(evidence)) return false;
  const approval = stageByKey(evidence, 'asset.approve');
  if (approval?.applicability === 'REQUIRED' && evidence.pendingAssets > 0) return false;
  if (blockingContinuityErrors(evidence) > 0) return false;
  return true;
}

function capabilityNeedsWork(evidence: JourneyEvidence, key: CapabilityKey): boolean {
  switch (key) {
    case 'generation.image.submit': return generationWorkNeeded(evidence, 'image');
    case 'generation.video.submit': return generationWorkNeeded(evidence, 'video');
    case 'continuity.check': return evidence.shotsCount > 0;
    case 'asset.approve': return evidence.pendingAssets > 0;
    case 'composer.compose': return evidence.readyForCompose && !Boolean(evidence.hasTimeline);
    case 'export.create': {
      const composerRequired = stageByKey(evidence, 'composer.compose')?.applicability === 'REQUIRED';
      return adaptedReviewComplete(evidence) &&
        evidence.readyForCompose &&
        evidence.exportsCount === 0 &&
        (!composerRequired || Boolean(evidence.hasTimeline));
    }
  }
}

function requiredGenerationAssetProgress(evidence: JourneyEvidence): { total: number; approved: number } {
  const kinds = new Set(
    requiredGenerationStages(evidence).map((stage) => stage.key === 'generation.image.submit' ? 'image' : 'video'),
  );
  let total = 0;
  let approved = 0;
  for (const shot of evidence.shots) {
    for (const kind of kinds) {
      const media = mediaFor(shot, kind);
      total += media.assetTotal;
      approved += media.approvedAssets;
    }
  }
  return { total, approved };
}

function requiredGenerationFailures(evidence: JourneyEvidence): number {
  return requiredGenerationStages(evidence).reduce((sum, stage) => {
    const kind = stage.key === 'generation.image.submit' ? 'image' : 'video';
    return sum + evidence.shots.reduce((shotSum, shot) => shotSum + mediaFor(shot, kind).failedGenerationCount, 0);
  }, 0);
}

function optionalGenerationFailures(evidence: JourneyEvidence): number {
  const optional = (evidence.capabilityStages ?? []).filter(
    (stage) => stage.applicability === 'OPTIONAL' &&
      (stage.key === 'generation.image.submit' || stage.key === 'generation.video.submit'),
  );
  return optional.reduce((sum, stage) => {
    const kind = stage.key === 'generation.image.submit' ? 'image' : 'video';
    return sum + evidence.shots.reduce((shotSum, shot) => shotSum + mediaFor(shot, kind).failedGenerationCount, 0);
  }, 0);
}

function issuesFromWorkspaceWarnings(evidence: JourneyEvidence): JourneyIssue[] {
  const issues: JourneyIssue[] = [];
  const adapted = Boolean(evidence.capabilityStages?.length);
  for (const warning of evidence.warnings) {
    const mapping = WARNING_SEVERITY[warning.key];
    if (!mapping) continue;

    let severity = mapping.severity;
    if (adapted && warning.key === 'asset-review') {
      const approval = stageByKey(evidence, 'asset.approve');
      if (!approval || approval.applicability === 'NOT_APPLICABLE') continue;
      if (approval.applicability === 'OPTIONAL') severity = 'WARNING';
    }
    if (adapted && warning.key === 'shot-media') {
      if (!requiredGenerationStages(evidence).some((stage) => capabilityNeedsWork(evidence, stage.key))) continue;
    }
    if (adapted && warning.key === 'generation-failures') {
      const requiredFailures = requiredGenerationFailures(evidence);
      const optionalFailures = optionalGenerationFailures(evidence);
      if (requiredFailures === 0 && optionalFailures === 0) continue;
      severity = requiredFailures > 0 ? 'BLOCKER' : 'WARNING';
    }

    issues.push({
      id: `warning.${warning.key}`,
      severity,
      phase: mapping.phase,
      message: warning.label,
      reason: warning.detail,
      evidenceSource: 'creativeWorkspaceService.overview().warnings',
      affectedEntity: null,
      targetRoute: warning.href,
      blocksPhase: severity === 'BLOCKER',
    });
  }
  return issues;
}

function issuesFromContinuity(evidence: JourneyEvidence): JourneyIssue[] {
  const stage = stageByKey(evidence, 'continuity.check');
  if (stage?.applicability === 'NOT_APPLICABLE') return [];
  const optional = stage?.applicability === 'OPTIONAL';

  return evidence.continuityFindings.map((finding) => {
    const severity: JourneyIssueSeverity = optional
      ? (finding.severity === 'info' ? 'INFO' : 'WARNING')
      : finding.severity === 'error' ? 'BLOCKER' : finding.severity === 'warning' ? 'WARNING' : 'INFO';
    return {
      id: `continuity.${finding.rule}.${finding.shotCodes.join('_') || 'project'}`,
      severity,
      phase: 'review',
      message: finding.message,
      reason: finding.rule,
      evidenceSource: 'continuityService.forProject',
      affectedEntity: finding.shotCodes.length > 0
        ? { kind: 'shot', id: finding.shotCodes[0]!, label: finding.shotCodes.join(', ') }
        : null,
      targetRoute: projectRoute(evidence.projectSlug, '/continuity'),
      blocksPhase: severity === 'BLOCKER',
    };
  });
}

function capabilityIssues(evidence: JourneyEvidence): JourneyIssue[] {
  return (evidence.capabilityStages ?? []).flatMap((stage): JourneyIssue[] => {
    if (stage.applicability !== 'REQUIRED') return [];
    if (stage.availability.state !== 'BLOCKED') return [];
    if (!capabilityNeedsWork(evidence, stage.key)) return [];
    return [{
      id: `capability.${stage.key}`,
      severity: 'BLOCKER',
      phase: stage.phase,
      message: `${stage.label} is unavailable`,
      reason: stage.availability.reasonCode ?? 'CAPABILITY_BLOCKED',
      evidenceSource: 'capabilityResolver',
      affectedEntity: null,
      targetRoute: stage.availability.reasonCode === 'NO_CAPABLE_PROVIDER' ? '/providers' : projectRoute(evidence.projectSlug),
      blocksPhase: true,
    }];
  });
}

/** Compatibility for pre-Part-2 unit fixtures only; real gathered evidence always has capabilityStages. */
function legacyProviderIssue(evidence: JourneyEvidence): JourneyIssue[] {
  if (evidence.capabilityStages) return [];
  const hasCompiledPrompt = evidence.shots.some((shot) => shot.promptCount > 0);
  if (!hasCompiledPrompt || evidence.providerCanGenerate !== false) return [];
  return [{
    id: 'produce.provider-unavailable',
    severity: 'BLOCKER',
    phase: 'produce',
    message: 'No provider available for generation',
    reason: 'No configured provider currently supports the required generation capability.',
    evidenceSource: 'legacy Slice-1 fixture compatibility',
    affectedEntity: null,
    targetRoute: '/providers',
    blocksPhase: true,
  }];
}

function productionTypeIssue(evidence: JourneyEvidence): JourneyIssue[] {
  if (!explicitProductionType(evidence) || evidence.productionType !== null) return [];
  return [{
    id: 'setup.production-type-required',
    severity: 'BLOCKER',
    phase: 'setup',
    message: 'Production Type is required',
    reason: 'Select a Production Type before the production path can be resolved.',
    evidenceSource: 'Project.productionType',
    affectedEntity: null,
    targetRoute: projectRoute(evidence.projectSlug),
    blocksPhase: true,
  }];
}

const PHASE_INDEX: Record<JourneyPhase, number> = Object.fromEntries(
  JOURNEY_PHASES.map((phase, index) => [phase, index]),
) as Record<JourneyPhase, number>;

function capabilityBlockActions(evidence: JourneyEvidence): JourneyAction[] {
  return capabilityIssues(evidence).map((issue) => {
    const key = issue.id.slice('capability.'.length) as CapabilityKey;
    const stage = stageByKey(evidence, key)!;
    const generation = key === 'generation.image.submit' || key === 'generation.video.submit';
    return {
      id: generation && stage.availability.reasonCode === 'NO_CAPABLE_PROVIDER'
        ? `produce.configure-${key === 'generation.image.submit' ? 'image' : 'video'}-provider`
        : `capability.${key}.resolve`,
      label: generation && stage.availability.reasonCode === 'NO_CAPABLE_PROVIDER'
        ? `Configure ${key === 'generation.image.submit' ? 'image' : 'video'} provider`
        : `Resolve ${stage.label.toLowerCase()} blocker`,
      reason: issue.reason,
      targetRoute: issue.targetRoute,
      phase: issue.phase,
      priority: 0,
      blocking: true,
      evidenceSource: 'capabilityResolver',
    };
  });
}

function buildActions(evidence: JourneyEvidence, allIssues: JourneyIssue[], continuityErrors: number): JourneyAction[] {
  const slug = evidence.projectSlug;
  if (explicitProductionType(evidence) && evidence.productionType === null) {
    return [{
      id: 'setup.select-production-type',
      label: 'Select Production Type',
      reason: 'The production path cannot be resolved until the project has an explicit Production Type.',
      targetRoute: projectRoute(slug),
      phase: 'setup',
      priority: 0,
      blocking: true,
      evidenceSource: 'Project.productionType',
    }];
  }

  const warningKeys = new Set(evidence.warnings.map((warning) => warning.key));
  const actions: JourneyAction[] = [...capabilityBlockActions(evidence)];

  if (continuityErrors > 0) {
    actions.push({
      id: 'review.resolve-continuity-errors', label: 'Resolve continuity errors',
      reason: `${continuityErrors} continuity error(s) are blocking generation`,
      targetRoute: projectRoute(slug, '/continuity'), phase: 'review', priority: 0, blocking: true,
      evidenceSource: 'continuityService.forProject',
    });
  }
  if (!evidence.capabilityStages && evidence.shots.some((shot) => shot.promptCount > 0) && evidence.providerCanGenerate === false) {
    actions.push({
      id: 'produce.configure-provider', label: 'Configure a provider',
      reason: 'No available provider supports this generation type', targetRoute: '/providers',
      phase: 'produce', priority: 0, blocking: true, evidenceSource: 'legacy Slice-1 fixture compatibility',
    });
  }

  if (evidence.episodeCount === 0) {
    actions.push({
      id: 'setup.create-first-episode', label: 'Create your first episode',
      reason: 'No episode exists yet — every later step needs one', targetRoute: projectRoute(slug),
      phase: 'setup', priority: 1, blocking: true, evidenceSource: 'episodeService.listEpisodes',
    });
    return actions;
  }

  if (warningKeys.has('script-empty')) {
    actions.push({ id: 'develop.write-script', label: 'Write or paste your script', reason: 'No script exists yet', targetRoute: projectRoute(slug, '/script'), phase: 'develop', priority: 2, blocking: true, evidenceSource: "creativeWorkspaceService.overview().warnings[script-empty]" });
  } else if (warningKeys.has('script-unparsed')) {
    actions.push({ id: 'develop.parse-script', label: 'Parse script into scenes', reason: 'Script has not been parsed into scenes yet', targetRoute: projectRoute(slug, '/script'), phase: 'develop', priority: 2, blocking: true, evidenceSource: "creativeWorkspaceService.overview().warnings[script-unparsed]" });
  } else if (evidence.scenesCount === 0) {
    actions.push({ id: 'develop.no-scenes-after-parse', label: 'Review your parsed script', reason: 'Script was parsed but produced no scenes', targetRoute: projectRoute(slug, '/script'), phase: 'develop', priority: 2, blocking: true, evidenceSource: 'creativeWorkspaceService.overview' });
  }

  if (evidence.scenesCount > 0) {
    if (evidence.shotsCount === 0) {
      actions.push({ id: 'plan.build-shots', label: 'Build shots for your scenes', reason: 'Scenes exist with no shots yet', targetRoute: projectRoute(slug, '/shots'), phase: 'plan', priority: 2, blocking: false, evidenceSource: "creativeWorkspaceService.overview().warnings[shots]" });
    }
    if (evidence.missingAnchors > 0) {
      actions.push({ id: 'plan.resolve-missing-anchors', label: 'Resolve missing anchor', reason: `${evidence.missingAnchors} pinned Bible snapshot(s) have no approved anchor`, targetRoute: projectRoute(slug, '/production'), phase: 'plan', priority: 2, blocking: true, evidenceSource: "creativeWorkspaceService.overview().warnings[anchors]" });
    }
  }

  if (evidence.shotsCount > 0) {
    const generationFailureIssue = allIssues.find((issue) => issue.id === 'warning.generation-failures');
    if (generationFailureIssue?.severity === 'BLOCKER') {
      actions.push({ id: 'produce.resolve-generation-failures', label: 'Review failed generation jobs', reason: 'One or more required generation jobs failed and need a decision', targetRoute: projectRoute(slug, '/queue'), phase: 'produce', priority: 3, blocking: true, evidenceSource: generationFailureIssue.evidenceSource });
    }
    if (evidence.capabilityStages) {
      const missingRequiredPrompts = requiredGenerationStages(evidence).flatMap((stage) => {
        const kind = stage.key === 'generation.image.submit' ? 'image' : 'video';
        const missingShots = evidence.shots.filter((shot) => mediaFor(shot, kind).promptCount === 0).length;
        return missingShots > 0 ? [{ kind, missingShots }] : [];
      });
      if (missingRequiredPrompts.length > 0) {
        const reason = missingRequiredPrompts
          .map(({ kind, missingShots }) => `${missingShots} shot(s) missing required ${kind} prompt`)
          .join('; ');
        actions.push({ id: 'produce.compile-prompts', label: 'Compile missing prompts', reason, targetRoute: projectRoute(slug), phase: 'produce', priority: 3, blocking: false, evidenceSource: 'creativeWorkspaceService.shotStoryboard.mediaEvidence' });
      }
    } else {
      const missingPrompts = evidence.shots.filter((shot) => shot.promptCount === 0).length;
      if (missingPrompts > 0) {
        actions.push({ id: 'produce.compile-prompts', label: 'Compile missing prompts', reason: `${missingPrompts} shot(s) have no compiled prompt yet`, targetRoute: projectRoute(slug), phase: 'produce', priority: 3, blocking: false, evidenceSource: 'creativeWorkspaceService.shotStoryboard' });
      }
    }
  }

  if (evidence.shotsCount > 0) {
    const approval = stageByKey(evidence, 'asset.approve');
    if (evidence.pendingAssets > 0 && approval?.applicability !== 'NOT_APPLICABLE') {
      actions.push({ id: 'review.pending-assets', label: 'Review pending assets', reason: `${evidence.pendingAssets} asset(s) are pending approval`, targetRoute: projectRoute(slug, '/assets'), phase: 'review', priority: 4, blocking: false, evidenceSource: "creativeWorkspaceService.overview().warnings[asset-review]" });
    } else if (evidence.pendingAssets > 0 && !evidence.capabilityStages) {
      actions.push({ id: 'review.pending-assets', label: 'Review pending assets', reason: `${evidence.pendingAssets} asset(s) are pending approval`, targetRoute: projectRoute(slug, '/assets'), phase: 'review', priority: 4, blocking: false, evidenceSource: "creativeWorkspaceService.overview().warnings[asset-review]" });
    }
    const continuityWarnings = allIssues.filter((issue) => issue.phase === 'review' && issue.id.startsWith('continuity.') && issue.severity === 'WARNING').length;
    if (continuityWarnings > 0) {
      actions.push({ id: 'review.continuity-warnings', label: 'Review continuity findings', reason: `${continuityWarnings} continuity warning(s) found`, targetRoute: projectRoute(slug, '/continuity'), phase: 'review', priority: 4, blocking: false, evidenceSource: 'continuityService.forProject' });
    }
  }

  if (evidence.shotsCount > 0 && evidence.readyForCompose && evidence.pendingAssets === 0 && continuityErrors === 0 && evidence.exportsCount === 0) {
    if (!evidence.capabilityStages) {
      actions.push({ id: 'finish.run-export', label: 'Run export', reason: 'All shots are ready and no export has been run yet', targetRoute: projectRoute(slug, '/export'), phase: 'finish', priority: 5, blocking: false, evidenceSource: 'creativeWorkspaceService.overview / exportService.list' });
    } else {
      const composer = stageByKey(evidence, 'composer.compose');
      const exporter = stageByKey(evidence, 'export.create');
      const composerRequired = composer?.applicability === 'REQUIRED';
      if (composer && composer.applicability !== 'NOT_APPLICABLE' && !evidence.hasTimeline) {
        actions.push({ id: 'finish.compose', label: 'Compose timeline', reason: 'Finishing requires a composed timeline before export', targetRoute: projectRoute(slug, '/export'), phase: 'finish', priority: composerRequired ? 5 : 6, blocking: false, evidenceSource: 'creativeWorkspaceService.overview().hasTimeline' });
      }
      if (exporter && exporter.applicability !== 'NOT_APPLICABLE' && (!composerRequired || Boolean(evidence.hasTimeline))) {
        actions.push({ id: 'finish.run-export', label: 'Run export', reason: 'Required finishing inputs are ready and no export has been run yet', targetRoute: projectRoute(slug, '/export'), phase: 'finish', priority: 5, blocking: false, evidenceSource: 'creativeWorkspaceService.overview / exportService.list' });
      }
    }
  }

  return actions;
}

function sortActions(actions: JourneyAction[]): JourneyAction[] {
  return [...actions].sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : PHASE_INDEX[a.phase] - PHASE_INDEX[b.phase]);
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

function partitionIssues(issues: JourneyIssue[], phase: JourneyPhase): { blockers: JourneyIssue[]; warnings: JourneyIssue[] } {
  const forPhase = issues.filter((issue) => issue.phase === phase);
  return {
    blockers: forPhase.filter((issue) => issue.severity === 'BLOCKER'),
    warnings: forPhase.filter((issue) => issue.severity === 'WARNING'),
  };
}

function emptyPhase(phase: JourneyPhase, state: JourneyPhaseStateValue = 'NOT_STARTED'): JourneyPhaseState {
  return { phase, state, progress: null, blockers: [], warnings: [], nextActions: [] };
}

export function deriveProductionJourneyState(evidence: JourneyEvidence): ProductionJourneyState {
  const allIssues: JourneyIssue[] = [
    ...productionTypeIssue(evidence),
    ...issuesFromWorkspaceWarnings(evidence),
    ...issuesFromContinuity(evidence),
    ...capabilityIssues(evidence),
    ...legacyProviderIssue(evidence),
  ];
  const continuityErrors = blockingContinuityErrors(evidence);
  const adapted = Boolean(evidence.capabilityStages?.length);
  const hasCompiledPrompt = adapted
    ? requiredGenerationStages(evidence).some((stage) => generationStageHasPrompt(evidence, stage.key))
    : evidence.shots.some((shot) => shot.promptCount > 0);
  const actions = sortActions(buildActions(evidence, allIssues, continuityErrors));
  const productionTypeMissing = explicitProductionType(evidence) && evidence.productionType === null;

  const phases: JourneyPhaseState[] = JOURNEY_PHASES.map((phase) => {
    if (productionTypeMissing && phase !== 'setup') return emptyPhase(phase);

    switch (phase) {
      case 'setup': {
        const { blockers, warnings } = partitionIssues(allIssues, phase);
        const state: JourneyPhaseStateValue = blockers.length > 0 ? 'BLOCKED' : evidence.episodeCount === 0 ? 'NOT_STARTED' : 'COMPLETE';
        return { phase, state, progress: null, blockers, warnings, nextActions: actions.filter((action) => action.phase === phase) };
      }
      case 'develop': {
        if (evidence.episodeCount === 0) return emptyPhase(phase);
        const { blockers, warnings } = partitionIssues(allIssues, phase);
        const state: JourneyPhaseStateValue = blockers.length > 0 ? 'BLOCKED' : evidence.scenesCount === 0 ? 'IN_PROGRESS' : 'COMPLETE';
        return { phase, state, progress: null, blockers, warnings, nextActions: actions.filter((action) => action.phase === phase) };
      }
      case 'plan': {
        if (evidence.episodeCount === 0 || evidence.scenesCount === 0) return emptyPhase(phase);
        const { blockers, warnings } = partitionIssues(allIssues, phase);
        let state: JourneyPhaseStateValue;
        if (blockers.length > 0) state = 'BLOCKED';
        else if (evidence.shotsCount === 0) state = 'IN_PROGRESS';
        else if (evidence.totalShots > 0 && evidence.readyShots === evidence.totalShots) state = 'COMPLETE';
        else state = 'IN_PROGRESS';
        return { phase, state, progress: ratio(evidence.readyShots, evidence.totalShots), blockers, warnings, nextActions: actions.filter((action) => action.phase === phase) };
      }
      case 'produce': {
        if (evidence.shotsCount === 0) return emptyPhase(phase);
        const { blockers, warnings } = partitionIssues(allIssues, phase);
        let state: JourneyPhaseStateValue;
        let progress: number | null;
        if (adapted) {
          const requiredProgress = requiredGenerationAssetProgress(evidence);
          progress = ratio(requiredProgress.approved, requiredProgress.total);
          if (blockers.length > 0) state = 'BLOCKED';
          else if (!hasCompiledPrompt) state = 'NOT_STARTED';
          else if (requiredGenerationComplete(evidence)) state = 'COMPLETE';
          else state = 'IN_PROGRESS';
        } else {
          const totalAssets = evidence.shots.reduce((sum, shot) => sum + shot.assetCoverage.total, 0);
          const approvedAssets = evidence.shots.reduce((sum, shot) => sum + shot.assetCoverage.approved, 0);
          const promptReadiness = ratio(evidence.shots.filter((shot) => shot.promptCount > 0).length, evidence.shots.length);
          progress = ratio(approvedAssets, totalAssets);
          if (blockers.length > 0) state = 'BLOCKED';
          else if (!hasCompiledPrompt) state = 'NOT_STARTED';
          else if (totalAssets > 0 && approvedAssets === totalAssets && promptReadiness === 100) state = 'COMPLETE';
          else state = 'IN_PROGRESS';
        }
        return { phase, state, progress, blockers, warnings, nextActions: actions.filter((action) => action.phase === phase) };
      }
      case 'review': {
        if (evidence.shotsCount === 0) return emptyPhase(phase);
        const { blockers, warnings } = partitionIssues(allIssues, phase);
        let state: JourneyPhaseStateValue;
        if (blockers.length > 0) state = 'BLOCKED';
        else if (adapted ? adaptedReviewComplete(evidence) : evidence.readyForCompose && continuityErrors === 0) state = 'COMPLETE';
        else state = 'IN_PROGRESS';
        return { phase, state, progress: null, blockers, warnings, nextActions: actions.filter((action) => action.phase === phase) };
      }
      case 'finish': {
        if (evidence.shotsCount === 0) return emptyPhase(phase);
        const { blockers, warnings } = partitionIssues(allIssues, phase);
        const publishOk = evidence.latestPublishStatus === null || evidence.latestPublishStatus === 'completed';
        let state: JourneyPhaseStateValue;
        if (blockers.length > 0) state = 'BLOCKED';
        else if (evidence.exportsCount > 0 && publishOk) state = 'COMPLETE';
        else if (evidence.exportsCount > 0) state = 'IN_PROGRESS';
        else if (adapted ? adaptedReviewComplete(evidence) && evidence.readyForCompose : evidence.readyForCompose) state = 'READY';
        else state = 'IN_PROGRESS';
        return { phase, state, progress: null, blockers, warnings, nextActions: actions.filter((action) => action.phase === phase) };
      }
    }
  });

  const primaryAction = actions[0] ?? null;
  const secondaryActions = primaryAction ? actions.filter((action) => action !== primaryAction) : [];
  const currentPhase = phases.find((phase) => phase.state === 'BLOCKED')?.phase
    ?? phases.find((phase) => phase.state !== 'COMPLETE')?.phase
    ?? 'finish';

  return {
    projectId: evidence.projectId,
    projectSlug: evidence.projectSlug,
    activeEpisodeId: evidence.activeEpisodeId,
    productionType: explicitProductionType(evidence) ? (evidence.productionType ?? null) : undefined,
    capabilityStages: evidence.capabilityStages ?? [],
    phases,
    currentPhase,
    primaryAction,
    secondaryActions,
    blockers: phases.flatMap((phase) => phase.blockers),
    warnings: phases.flatMap((phase) => phase.warnings),
    computedAt: evidence.computedAt,
  };
}

export function createProductionJourneyService(studio: Studio) {
  return {
    async overview(projectIdOrSlug: string, episodeId?: string): Promise<ProductionJourneyState> {
      return deriveProductionJourneyState(await gatherJourneyEvidence(studio, projectIdOrSlug, episodeId));
    },
  };
}

export type ProductionJourneyService = ReturnType<typeof createProductionJourneyService>;
