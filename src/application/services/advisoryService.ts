/**
 * Advisory service — M9 initial slice (read/analyze/propose only).
 *
 * Gathers real, currently-persisted project state (continuity findings, cost
 * against ceiling, shot readiness) and asks the text provider for advisory
 * suggestions. Nothing here mutates or persists anything: the result is
 * computed fresh on every call and handed straight back to the caller, per
 * docs/decisions/ADR-014-ai-assisted-production-boundary.md SS1.1. There is
 * no mutation path, no Server Action, and no repository write in this file.
 */
import { notFound } from '@/domain/errors';
import { productionAdvisorySchema, type ProductionAdvisorySuggestion } from '@/domain/schemas';
import { createContinuityService } from './continuityService';
import { createCreativeWorkspaceService } from './creativeWorkspaceService';
import type { Studio } from '../ports';

export function createAdvisoryService(studio: Studio) {
  const { projects, generations } = studio;
  const workspace = createCreativeWorkspaceService(studio);
  const continuityService = createContinuityService(studio);

  return {
    /** Fresh, ephemeral advisory suggestions for one project — never persisted. */
    async getSuggestions(projectIdOrSlug: string): Promise<ProductionAdvisorySuggestion[]> {
      const project = (await projects.byId(projectIdOrSlug)) ?? (await projects.bySlug(projectIdOrSlug));
      if (!project) throw notFound('Project', projectIdOrSlug);

      const [continuity, overview, spentUsd] = await Promise.all([
        continuityService.forProject(project.id),
        workspace.overview(project.id),
        generations.spentUsd(project.id),
      ]);

      const readyShots = overview.readiness?.readyShots ?? 0;
      const totalShots = overview.readiness?.totalShots ?? 0;
      const unreadyShotCount = Math.max(0, totalShots - readyShots);

      const input = [
        `continuityFindingCount: ${continuity.findings.length}`,
        `continuitySeverity: ${continuity.blocked ? 'blocking' : 'non-blocking'}`,
        `costSpentUsd: ${spentUsd}`,
        `costCeilingUsd: ${project.costLimitUsd}`,
        `unreadyShotCount: ${unreadyShotCount}`,
        `totalShotCount: ${totalShots}`,
      ].join('\n');

      const provider = studio.providers.text();
      const result = await provider.complete<unknown>({
        instruction:
          'You are a production advisor for a film studio app. From the project signals given, propose ' +
          'concrete, actionable suggestions an operator can read and act on manually. Never claim an action ' +
          'was taken — only suggest.',
        input,
        model: studio.providers.defaultModelFor('text'),
        jsonSchemaName: 'production-advisory',
      });

      const parsed = productionAdvisorySchema.safeParse(result.value);
      if (!parsed.success) return [];
      return parsed.data.suggestions;
    },
  };
}
