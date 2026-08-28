import type { ProviderDescriptor } from '../ports';
import type { ProductionType, ProjectStatus } from '@/domain/enums';
import type { CapabilityKey, CapabilityResolution } from '@/domain/capability';
import {
  getProductionTypeTemplate,
  type ProductionTemplateWorkflowNode,
} from '@/domain/productionTypeTemplates';
import { createCapabilityResolver } from './capabilityResolver';

export type JourneyCapabilityApplicability = 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE';

export interface JourneyCapabilityStage {
  key: CapabilityKey;
  label: string;
  phase: 'produce' | 'review' | 'finish';
  applicability: JourneyCapabilityApplicability;
  availability: CapabilityResolution;
}

export interface JourneyCapabilityContext {
  productionType: ProductionType | null;
  projectStatus: ProjectStatus;
  providerDescriptors: readonly ProviderDescriptor[];
}

const STAGES: ReadonlyArray<{
  key: CapabilityKey;
  node: ProductionTemplateWorkflowNode;
  label: string;
  phase: JourneyCapabilityStage['phase'];
}> = [
  { key: 'generation.image.submit', node: 'generate-image', label: 'Image generation', phase: 'produce' },
  { key: 'generation.video.submit', node: 'generate-video', label: 'Video generation', phase: 'produce' },
  { key: 'continuity.check', node: 'check-continuity', label: 'Continuity check', phase: 'review' },
  { key: 'asset.approve', node: 'approve-asset', label: 'Asset approval', phase: 'review' },
  { key: 'composer.compose', node: 'composite-video', label: 'Compose', phase: 'finish' },
  { key: 'export.create', node: 'export-package', label: 'Export', phase: 'finish' },
];

export function deriveJourneyCapabilityStages(context: JourneyCapabilityContext): JourneyCapabilityStage[] {
  const resolver = createCapabilityResolver();
  const template = context.productionType
    ? getProductionTypeTemplate(context.productionType).capabilityTemplate
    : null;

  return STAGES.map((stage) => {
    const applicability: JourneyCapabilityApplicability = !template
      ? 'NOT_APPLICABLE'
      : template.requiredWorkflowNodes.includes(stage.node)
        ? 'REQUIRED'
        : template.optionalWorkflowNodes.includes(stage.node)
          ? 'OPTIONAL'
          : 'NOT_APPLICABLE';

    return {
      key: stage.key,
      label: stage.label,
      phase: stage.phase,
      applicability,
      availability: resolver.resolve(context, stage.key),
    };
  });
}
