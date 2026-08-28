import type { ProductionType, ProjectFormat, WorkflowKey } from './enums';

/**
 * Workflow-node requirements copied from the accepted production-type planning
 * document. This is metadata only: it does not execute a workflow and it does
 * not resolve capability state.
 */
export type ProductionTemplateWorkflowNode =
  | 'generate-image'
  | 'generate-video'
  | 'check-continuity'
  | 'approve-asset'
  | 'composite-video'
  | 'export-package';

export interface ProductionCapabilityTemplate {
  readonly requiredWorkflowNodes: readonly ProductionTemplateWorkflowNode[];
  readonly optionalWorkflowNodes: readonly ProductionTemplateWorkflowNode[];
}

export interface ProductionTypeTemplate {
  readonly id: ProductionType;
  /** Advisory relationship only. Never use this field to derive identity. */
  readonly advisoryProjectFormat: ProjectFormat | null;
  /** Advisory/default relationship only. It does not authorize workflow execution. */
  readonly advisoryWorkflowKey: WorkflowKey | null;
  readonly capabilityTemplate: ProductionCapabilityTemplate;
}

function capabilityTemplate(
  requiredWorkflowNodes: readonly ProductionTemplateWorkflowNode[],
  optionalWorkflowNodes: readonly ProductionTemplateWorkflowNode[],
): ProductionCapabilityTemplate {
  return Object.freeze({
    requiredWorkflowNodes: Object.freeze([...requiredWorkflowNodes]),
    optionalWorkflowNodes: Object.freeze([...optionalWorkflowNodes]),
  });
}

function template(
  id: ProductionType,
  advisoryProjectFormat: ProjectFormat | null,
  advisoryWorkflowKey: WorkflowKey | null,
  requiredWorkflowNodes: readonly ProductionTemplateWorkflowNode[],
  optionalWorkflowNodes: readonly ProductionTemplateWorkflowNode[] = [],
): ProductionTypeTemplate {
  return Object.freeze({
    id,
    advisoryProjectFormat,
    advisoryWorkflowKey,
    capabilityTemplate: capabilityTemplate(requiredWorkflowNodes, optionalWorkflowNodes),
  });
}

/**
 * Canonical read-only bridge for the eight accepted production-type identities.
 *
 * ProjectFormat and WorkflowKey values are explicitly advisory. In particular,
 * a project with `format: 'motion-comic'` still has no production-type identity
 * until `productionType` is explicitly selected and persisted.
 */
export const PRODUCTION_TYPE_TEMPLATES: Readonly<Record<ProductionType, ProductionTypeTemplate>> = Object.freeze({
  'cinematic-short-film': template(
    'cinematic-short-film',
    'short-film',
    'photoreal',
    ['generate-image', 'generate-video', 'check-continuity', 'approve-asset', 'composite-video', 'export-package'],
  ),
  'animated-series': template(
    'animated-series',
    'series',
    'photoreal',
    ['generate-image', 'generate-video', 'check-continuity', 'approve-asset', 'composite-video', 'export-package'],
  ),
  'silent-comedy': template(
    'silent-comedy',
    null,
    'ugc',
    ['generate-image', 'generate-video', 'composite-video', 'export-package'],
    ['check-continuity', 'approve-asset'],
  ),
  'motion-comic': template(
    'motion-comic',
    'motion-comic',
    'motion-comic',
    ['generate-image', 'check-continuity', 'approve-asset', 'composite-video', 'export-package'],
    ['generate-video'],
  ),
  'youtube-short': template(
    'youtube-short',
    'ugc',
    'ugc',
    ['generate-image', 'composite-video', 'export-package'],
    ['generate-video', 'check-continuity', 'approve-asset'],
  ),
  'product-ad': template(
    'product-ad',
    'commercial',
    'product',
    ['generate-image', 'generate-video', 'approve-asset', 'export-package'],
    ['check-continuity', 'composite-video'],
  ),
  documentary: template(
    'documentary',
    null,
    null,
    ['generate-image', 'generate-video', 'composite-video', 'export-package'],
    ['check-continuity', 'approve-asset'],
  ),
  'educational-video': template(
    'educational-video',
    'explainer',
    'ugc',
    ['generate-image', 'composite-video', 'export-package'],
    ['generate-video', 'check-continuity', 'approve-asset'],
  ),
});

export function getProductionTypeTemplate(productionType: ProductionType): ProductionTypeTemplate {
  return PRODUCTION_TYPE_TEMPLATES[productionType];
}
