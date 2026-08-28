import { describe, expect, it } from 'vitest';
import { PRODUCTION_TYPES } from '@/domain/enums';
import * as productionTypeIdentity from '@/domain/productionTypeIdentity';

type ParseSchema = {
  safeParse(input: unknown): { success: boolean };
};

function getProductFacingCreateSchema(): ParseSchema | undefined {
  return (
    productionTypeIdentity as unknown as {
      createProductFacingProjectSchema?: ParseSchema;
    }
  ).createProductFacingProjectSchema;
}

describe('production type selection — product-facing create boundary', () => {
  it('requires an explicit production type for new product-facing projects while preserving the legacy/internal nullable boundary', () => {
    const schema = getProductFacingCreateSchema();

    expect(schema).toBeDefined();
    if (!schema) return;

    expect(schema.safeParse({ title: 'Missing Production Type' }).success).toBe(false);
    expect(schema.safeParse({ title: 'Null Production Type', productionType: null }).success).toBe(false);
    expect(
      productionTypeIdentity.createProjectWithProductionTypeSchema.safeParse({
        title: 'Legacy Internal Project',
      }).success,
    ).toBe(true);
  });

  it('accepts exactly the eight explicit production types and does not treat Project.format as an identity alias', () => {
    const schema = getProductFacingCreateSchema();

    expect(schema).toBeDefined();
    if (!schema) return;

    for (const productionType of PRODUCTION_TYPES) {
      expect(
        schema.safeParse({
          title: `Project ${productionType}`,
          format: 'motion-comic',
          productionType,
        }).success,
      ).toBe(true);
    }

    expect(
      schema.safeParse({
        title: 'Format Is Not Production Type',
        format: 'motion-comic',
        productionType: 'short-film',
      }).success,
    ).toBe(false);
  });
});
