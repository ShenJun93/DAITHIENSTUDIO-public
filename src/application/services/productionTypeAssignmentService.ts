import { createProjectService } from './projectService';
import type { Studio } from '../ports';
import type { ProductionType } from '@/domain/enums';
import type { ProductionTypeProjectRecord } from '../productionTypeProjectPort';
import { z } from 'zod';
import { productionTypeSchema } from '@/domain/productionTypeIdentity';

export type ProductionDataEvidenceKind =
  | 'script'
  | 'scenes'
  | 'shots'
  | 'prompts'
  | 'generations'
  | 'assets'
  | 'workflows'
  | 'timelines'
  | 'exports'
  | 'publishes'
  | 'node-graphs';

export interface ProductionTypeEvidenceInspection {
  projectId: string;
  currentProductionType: ProductionType | null;
  hasProductionData: boolean;
  evidence: readonly ProductionDataEvidenceKind[];
}

export type ProductionTypeAssignmentResult =
  | {
      status: 'NO_CHANGE';
      project: ProductionTypeProjectRecord;
      evidence: readonly ProductionDataEvidenceKind[];
    }
  | {
      status: 'CONFIRMATION_REQUIRED';
      project: ProductionTypeProjectRecord;
      evidence: readonly ProductionDataEvidenceKind[];
    }
  | {
      status: 'UPDATED';
      project: ProductionTypeProjectRecord;
      evidence: readonly ProductionDataEvidenceKind[];
    };

export function createProductionTypeAssignmentService(studio: Studio) {
  const projectService = createProjectService(studio);

  async function inspect(projectIdOrSlug: string): Promise<ProductionTypeEvidenceInspection> {
    const project = await projectService.get(projectIdOrSlug);
    const projectId = project.id;
    const evidenceList: ProductionDataEvidenceKind[] = [];

    // script
    const script = await studio.scripts.current(projectId);
    if (script && (script.raw.trim().length > 0 || script.parsedAt !== null)) {
      evidenceList.push('script');
    }

    // scenes
    const scenes = await studio.scenes.listByProject(projectId);
    if (scenes.length > 0) {
      evidenceList.push('scenes');
    }

    // shots
    const shots = await studio.shots.listByProject(projectId);
    if (shots.length > 0) {
      evidenceList.push('shots');
    }

    // prompts
    const prompts = await studio.prompts.listByProject(projectId);
    if (prompts.length > 0) {
      evidenceList.push('prompts');
    }

    // generations
    const generations = await studio.generations.listByProject(projectId, { limit: 1 });
    if (generations.length > 0) {
      evidenceList.push('generations');
    }

    // assets
    const assets = await studio.assets.list(projectId, { limit: 1 });
    if (assets.length > 0) {
      evidenceList.push('assets');
    }

    // workflows
    const workflows = await studio.workflows.listByProject(projectId);
    if (workflows.length > 0) {
      evidenceList.push('workflows');
    }

    // timelines
    const episodes = await studio.episodes.listByProject(projectId);
    let hasTimeline = false;
    for (const ep of episodes) {
      const tls = await studio.timelines.listByEpisode(projectId, ep.id);
      if (tls.length > 0) {
        hasTimeline = true;
        break;
      }
    }
    if (hasTimeline) {
      evidenceList.push('timelines');
    }

    // exports
    const exports = await studio.exports.listByProject(projectId);
    if (exports.length > 0) {
      evidenceList.push('exports');
    }

    // publishes
    const publishes = await studio.publishes.listByProject(projectId);
    if (publishes.length > 0) {
      evidenceList.push('publishes');
    }

    // node-graphs
    const nodeGraphs = await studio.nodeGraphs.listByProject(projectId);
    if (nodeGraphs.length > 0) {
      evidenceList.push('node-graphs');
    }

    return {
      projectId,
      currentProductionType: project.productionType ?? null,
      hasProductionData: evidenceList.length > 0,
      evidence: evidenceList,
    };
  }

  return {
    inspect,
    async change(
      projectIdOrSlug: string,
      input: {
        productionType: ProductionType | null;
        confirmExistingProductionData?: boolean;
      }
    ): Promise<ProductionTypeAssignmentResult> {
      const targetType = z.union([productionTypeSchema, z.null()]).parse(input.productionType);
      
      const project = await projectService.get(projectIdOrSlug);
      
      const inspection = await inspect(projectIdOrSlug);

      if (targetType === inspection.currentProductionType) {
        return {
          status: 'NO_CHANGE',
          project,
          evidence: inspection.evidence,
        };
      }

      if (inspection.hasProductionData && !input.confirmExistingProductionData) {
        return {
          status: 'CONFIRMATION_REQUIRED',
          project,
          evidence: inspection.evidence,
        };
      }

      const updatedProject = await projectService.update(project.id, {
        productionType: targetType,
      });

      return {
        status: 'UPDATED',
        project: updatedProject,
        evidence: inspection.evidence,
      };
    },
  };
}
