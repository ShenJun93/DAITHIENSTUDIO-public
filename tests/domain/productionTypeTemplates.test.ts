import { describe, expect, it } from 'vitest';
import { PRODUCTION_TYPES } from '@/domain/enums';
import {
  PRODUCTION_TYPE_TEMPLATES,
  getProductionTypeTemplate,
} from '@/domain/productionTypeTemplates';

const expectedMappings = {
  'cinematic-short-film': { advisoryProjectFormat: 'short-film', advisoryWorkflowKey: 'photoreal' },
  'animated-series': { advisoryProjectFormat: 'series', advisoryWorkflowKey: 'photoreal' },
  'silent-comedy': { advisoryProjectFormat: null, advisoryWorkflowKey: 'ugc' },
  'motion-comic': { advisoryProjectFormat: 'motion-comic', advisoryWorkflowKey: 'motion-comic' },
  'youtube-short': { advisoryProjectFormat: 'ugc', advisoryWorkflowKey: 'ugc' },
  'product-ad': { advisoryProjectFormat: 'commercial', advisoryWorkflowKey: 'product' },
  documentary: { advisoryProjectFormat: null, advisoryWorkflowKey: null },
  'educational-video': { advisoryProjectFormat: 'explainer', advisoryWorkflowKey: 'ugc' },
} as const;

describe('production type template bridge', () => {
  it('defines exactly the eight accepted production-type identities', () => {
    expect(PRODUCTION_TYPES).toEqual([
      'cinematic-short-film',
      'animated-series',
      'silent-comedy',
      'motion-comic',
      'youtube-short',
      'product-ad',
      'documentary',
      'educational-video',
    ]);
    expect(Object.keys(PRODUCTION_TYPE_TEMPLATES)).toEqual(PRODUCTION_TYPES);
  });

  it('keeps format/workflow relationships explicit and advisory rather than identity aliases', () => {
    for (const productionType of PRODUCTION_TYPES) {
      const template = getProductionTypeTemplate(productionType);
      expect({
        advisoryProjectFormat: template.advisoryProjectFormat,
        advisoryWorkflowKey: template.advisoryWorkflowKey,
      }).toEqual(expectedMappings[productionType]);
      expect(template.id).toBe(productionType);
    }
  });

  it('carries only read-only workflow-node requirement metadata for later capability resolution', () => {
    expect(getProductionTypeTemplate('silent-comedy').capabilityTemplate).toEqual({
      requiredWorkflowNodes: ['generate-image', 'generate-video', 'composite-video', 'export-package'],
      optionalWorkflowNodes: ['check-continuity', 'approve-asset'],
    });
    expect(getProductionTypeTemplate('motion-comic').capabilityTemplate).toEqual({
      requiredWorkflowNodes: [
        'generate-image',
        'check-continuity',
        'approve-asset',
        'composite-video',
        'export-package',
      ],
      optionalWorkflowNodes: ['generate-video'],
    });
  });

  it('freezes the registry and nested capability metadata at runtime', () => {
    expect(Object.isFrozen(PRODUCTION_TYPE_TEMPLATES)).toBe(true);
    for (const productionType of PRODUCTION_TYPES) {
      const template = getProductionTypeTemplate(productionType);
      expect(Object.isFrozen(template)).toBe(true);
      expect(Object.isFrozen(template.capabilityTemplate)).toBe(true);
      expect(Object.isFrozen(template.capabilityTemplate.requiredWorkflowNodes)).toBe(true);
      expect(Object.isFrozen(template.capabilityTemplate.optionalWorkflowNodes)).toBe(true);
    }
  });
});
