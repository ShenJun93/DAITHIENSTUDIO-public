import { createProjectService } from '@/application/services/projectService';
import { blockingIssues } from '@/domain/prompt/lint';
import { getStudio } from '@/infrastructure/container';

export interface AssetCompareReadInput {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  version: number;
  checksum: string;
  approvalState: 'pending' | 'approved' | 'rejected';
  generationId: string | null;
}

export interface AssetCompareReadCandidate extends AssetCompareReadInput {
  generation: {
    id: string;
    provider: string;
    model: string;
    actualCostUsd: number;
    promptId: string | null;
    promptVersion: number | null;
  } | null;
  prompt: { id: string; version: number; lintOk: boolean | null; blockingFindingCount: number } | null;
  quality: { id: string; score: number; passed: boolean; createdAt: string } | null;
  approval: { decision: string; note: string; decidedBy: string | null; createdAt: string } | null;
  lineageHref: string;
}

export async function loadAssetCompareReadCandidates(
  projectSlug: string,
  assets: AssetCompareReadInput[],
): Promise<AssetCompareReadCandidate[]> {
  const studio = getStudio();
  const project = await createProjectService(studio).get(projectSlug);

  return Promise.all(
    assets.map(async (asset) => {
      const generation = asset.generationId ? await studio.generations.byId(asset.generationId) : null;
      const prompt = generation?.promptId && generation.promptVersion
        ? await studio.prompts.version(generation.promptId, generation.promptVersion)
        : null;
      const [quality, decisions] = await Promise.all([
        studio.quality.latestForAsset(asset.id),
        studio.approvals.listForTarget(project.id, 'asset', asset.id),
      ]);
      const latestDecision = decisions[0] ?? null;

      return {
        ...asset,
        generation: generation
          ? {
              id: generation.id,
              provider: generation.provider,
              model: generation.model,
              actualCostUsd: generation.actualCostUsd,
              promptId: generation.promptId,
              promptVersion: generation.promptVersion,
            }
          : null,
        prompt: prompt
          ? {
              id: prompt.promptId,
              version: prompt.version,
              lintOk: prompt.lint?.ok ?? null,
              blockingFindingCount: prompt.lint ? blockingIssues(prompt.lint).length : 1,
            }
          : null,
        quality: quality
          ? { id: quality.id, score: quality.score, passed: quality.passed, createdAt: quality.createdAt }
          : null,
        approval: latestDecision
          ? {
              decision: latestDecision.decision,
              note: latestDecision.note,
              decidedBy: latestDecision.decidedBy,
              createdAt: latestDecision.createdAt,
            }
          : null,
        lineageHref: `/projects/${projectSlug}/assets?focus=${asset.id}`,
      };
    }),
  );
}
