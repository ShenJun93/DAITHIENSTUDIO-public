/**
 * Quality control service. Runs the automatic checks and records the report;
 * checks that need human eyes are returned as `manual` rather than assumed.
 */
import { buildQualityReport, pendingManualChecks, type QualitySubject } from '@/domain/quality';
import { notFound } from '@/domain/errors';
import type { Studio } from '../ports';
import type { QualityReportRecord } from '../records';

export function createQualityService(studio: Studio) {
  const { assets, generations, shots, prompts, projects, quality, activity } = studio;

  return {
    async checkAsset(assetId: string): Promise<QualityReportRecord> {
      const asset = await assets.byId(assetId);
      if (!asset) throw notFound('Asset', assetId);
      const project = await projects.byId(asset.projectId);
      if (!project) throw notFound('Project', asset.projectId);
      const shot = asset.shotId ? await shots.byId(asset.shotId) : null;

      const generation = asset.generationId ? await generations.byId(asset.generationId) : null;
      const promptVersion = generation?.promptId && generation.promptVersion
        ? await prompts.version(generation.promptId, generation.promptVersion)
        : null;
      const lockRefs = promptVersion?.lockRefs;

      const subject: QualitySubject = {
        kind:
          asset.kind === 'video'
            ? 'video'
            : asset.kind === 'image' || asset.kind === 'storyboard'
              ? 'image'
              : asset.kind === 'voice' || asset.kind === 'music' || asset.kind === 'sound'
                ? asset.kind
                : 'other',
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        durationSeconds: asset.durationSeconds,
        expectedAspectRatio: shot?.aspectRatio ?? project.aspectRatio,
        expectedDurationSeconds: shot?.durationSeconds ?? null,
        expectedResolution: null,
        hasCharacterLock: (lockRefs?.characters.length ?? 0) > 0,
        hasStyleLock: Boolean(lockRefs?.style),
        hasLocationLock: Boolean(lockRefs?.location),
        referencedPropCount: lockRefs?.props.length ?? 0,
        shotPropCount: shot?.props.length ?? 0,
        loudnessDbfs: null,
        subtitleAligned: null,
      };

      const result = buildQualityReport(subject);
      const report = await quality.save({
        projectId: asset.projectId,
        targetType: 'asset',
        shotId: asset.shotId,
        assetId: asset.id,
        score: result.score,
        passed: result.passed,
        checks: result.checks,
      });

      await activity.log({
        projectId: asset.projectId,
        userId: null,
        action: 'quality.checked',
        targetType: 'asset',
        targetId: asset.id,
        details: { score: result.score, passed: result.passed, manual: pendingManualChecks(result.checks).length },
      });

      return report;
    },

    async latestForAsset(assetId: string) {
      return quality.latestForAsset(assetId);
    },

    async listForProject(projectIdOrSlug: string) {
      const project = (await projects.byId(projectIdOrSlug)) ?? (await projects.bySlug(projectIdOrSlug));
      if (!project) throw notFound('Project', projectIdOrSlug);
      return quality.listByProject(project.id);
    },
  };
}

export type QualityService = ReturnType<typeof createQualityService>;
