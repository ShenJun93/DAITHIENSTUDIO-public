import { z } from 'zod';
import { PRODUCTION_TYPES } from './enums';
import { createProjectSchema, updateProjectSchema } from './schemas';

export const productionTypeSchema = z.enum(PRODUCTION_TYPES);

/**
 * Narrow extension of the existing project boundary. Keeping the base schemas
 * intact avoids treating production type as an alias or replacement for
 * Project.format while still validating explicit create/update selection.
 */
export const createProjectWithProductionTypeSchema = createProjectSchema.extend({
  productionType: productionTypeSchema.nullable().optional(),
});
export type CreateProjectWithProductionTypeInput = z.infer<typeof createProjectWithProductionTypeSchema>;

export const updateProjectWithProductionTypeSchema = updateProjectSchema.extend({
  productionType: productionTypeSchema.nullable().optional(),
});
export type UpdateProjectWithProductionTypeInput = z.infer<typeof updateProjectWithProductionTypeSchema>;

export const createProductFacingProjectSchema =
  createProjectWithProductionTypeSchema.extend({
    productionType: productionTypeSchema,
  });

export type CreateProductFacingProjectInput =
  z.infer<typeof createProductFacingProjectSchema>;
