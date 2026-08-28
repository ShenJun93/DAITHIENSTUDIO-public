import type { ProviderCapabilities, ProviderDescriptor } from '../ports';
import type { ProductionType, ProjectStatus } from '@/domain/enums';
import type { CapabilityKey, CapabilityResolution } from '@/domain/capability';
import {
  getProductionTypeTemplate,
  type ProductionTemplateWorkflowNode,
} from '@/domain/productionTypeTemplates';

export interface CapabilityContext {
  productionType: ProductionType | null;
  projectStatus: ProjectStatus;
  providerDescriptors: readonly ProviderDescriptor[];
}

const NODE_BY_KEY: Record<CapabilityKey, ProductionTemplateWorkflowNode> = {
  'generation.image.submit': 'generate-image',
  'generation.video.submit': 'generate-video',
  'continuity.check': 'check-continuity',
  'asset.approve': 'approve-asset',
  'composer.compose': 'composite-video',
  'export.create': 'export-package',
};

const MUTATING_KEYS = new Set<CapabilityKey>([
  'generation.image.submit',
  'generation.video.submit',
  'asset.approve',
  'composer.compose',
  'export.create',
]);

const PROVIDER_CAPABILITY_BY_KEY: Partial<Record<CapabilityKey, keyof ProviderCapabilities>> = {
  'generation.image.submit': 'textToImage',
  'generation.video.submit': 'textToVideo',
};

function available(key: CapabilityKey): CapabilityResolution {
  return { key, state: 'AVAILABLE', reasonCode: null };
}

export function createCapabilityResolver() {
  return {
    resolve(context: CapabilityContext, key: CapabilityKey): CapabilityResolution {
      if (context.productionType === null) {
        return { key, state: 'BLOCKED', reasonCode: 'PRODUCTION_TYPE_REQUIRED' };
      }

      const node = NODE_BY_KEY[key];
      const capabilityTemplate = getProductionTypeTemplate(context.productionType).capabilityTemplate;
      const applicable =
        capabilityTemplate.requiredWorkflowNodes.includes(node) ||
        capabilityTemplate.optionalWorkflowNodes.includes(node);

      if (!applicable) {
        return { key, state: 'UNSUPPORTED', reasonCode: 'NOT_APPLICABLE_TO_PRODUCTION_TYPE' };
      }

      if (context.projectStatus === 'archived' && MUTATING_KEYS.has(key)) {
        return { key, state: 'BLOCKED', reasonCode: 'PROJECT_ARCHIVED' };
      }

      const providerCapability = PROVIDER_CAPABILITY_BY_KEY[key];
      if (
        providerCapability &&
        !context.providerDescriptors.some((descriptor) => Boolean(descriptor.capabilities[providerCapability]))
      ) {
        return { key, state: 'BLOCKED', reasonCode: 'NO_CAPABLE_PROVIDER' };
      }

      return available(key);
    },

    resolveAll(
      context: CapabilityContext,
      keys: readonly CapabilityKey[],
    ): Partial<Record<CapabilityKey, CapabilityResolution>> {
      return Object.fromEntries(keys.map((key) => [key, this.resolve(context, key)])) as Partial<
        Record<CapabilityKey, CapabilityResolution>
      >;
    },
  };
}
