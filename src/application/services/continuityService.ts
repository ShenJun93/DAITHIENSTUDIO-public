/**
 * Continuity service — assembles the data the domain checker needs and caches
 * nothing, so a report is always about the project as it is right now.
 */
import { blockingFindings, checkContinuity, continuitySummary, type ContinuityShot } from '@/domain/continuity';
import { notFound } from '@/domain/errors';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import type { Studio } from '../ports';
import type { ContinuityReport } from '../records';

export function createContinuityService(studio: Studio) {
  const { shots, scenes, prompts, assets, projects } = studio;

  async function buildShotView(projectId: string): Promise<ContinuityShot[]> {
    const [shotList, sceneList] = await Promise.all([shots.listByProject(projectId), scenes.listByProject(projectId)]);
    const sceneById = new Map(sceneList.map((scene) => [scene.id, scene]));

    const views: ContinuityShot[] = [];
    for (const shot of shotList) {
      const imagePrompt = await prompts.findForShot(shot.id, 'image');
      const latest = imagePrompt ? await prompts.latestVersion(imagePrompt.id) : null;
      const styleRef = latest?.lockRefs.style ?? null;

      const shotAssets = await assets.list(projectId, { shotId: shot.id, limit: 100 });

      views.push({
        code: shot.code,
        sceneCode: sceneById.get(shot.sceneId)?.code ?? '',
        sceneId: shot.sceneId,
        shotNumber: shot.shotNumber,
        shotSize: shot.shotSize,
        characters: shot.characters,
        props: shot.props,
        locationId: shot.locationId,
        locationVersionId: shot.locationVersionId,
        lighting: shot.lighting,
        dialogue: shot.dialogue,
        status: shot.status,
        importance: shot.importance,
        continuity: shot.continuity,
        lockedStyleVersionId: styleRef ? formatSnapshotId(styleRef.code, styleRef.version) : null,
        hasReferenceAsset: shotAssets.length > 0,
        hasApprovedKeyframe: shotAssets.some(
          (asset) => asset.approvalState === 'approved' && (asset.kind === 'image' || asset.kind === 'storyboard'),
        ),
      });
    }
    return views;
  }

  return {
    /** Full project report, grouped and summarised. */
    async forProject(projectIdOrSlug: string): Promise<ContinuityReport> {
      const project = (await projects.byId(projectIdOrSlug)) ?? (await projects.bySlug(projectIdOrSlug));
      if (!project) throw notFound('Project', projectIdOrSlug);

      const findings = checkContinuity(await buildShotView(project.id));
      const summary = continuitySummary(findings);
      return { findings, ...summary };
    },

    /** Report narrowed to one shot — used as the pre-generation gate. */
    async forShot(shotId: string): Promise<ContinuityReport> {
      const shot = await shots.byId(shotId);
      if (!shot) throw notFound('Shot', shotId);

      const all = checkContinuity(await buildShotView(shot.projectId));
      const findings = all.filter((finding) => finding.shotCodes.includes(shot.code));
      const summary = continuitySummary(findings);
      return { findings, ...summary };
    },

    blocking: blockingFindings,
  };
}

export type ContinuityService = ReturnType<typeof createContinuityService>;
