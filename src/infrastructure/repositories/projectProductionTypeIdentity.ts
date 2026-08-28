import { eq } from 'drizzle-orm';
import type { Clock } from '@/application/ports';
import type { ProjectRecord } from '@/application/records';
import type {
  ProductionTypeProjectRecord,
  ProductionTypeProjectRepository,
} from '@/application/productionTypeProjectPort';
import type { ProductionType } from '@/domain/enums';
import { productionTypeSchema } from '@/domain/productionTypeIdentity';
import type { Db } from '../db/client';
import { projectProductionTypes } from '../db/projectProductionTypes';
import { createProjectRepository } from './production';

/**
 * Decorates the existing project repository with one explicit production-type
 * identity. Project.format remains entirely owned by the existing repository;
 * there is deliberately no derivation between the two vocabularies.
 */
export function createProjectRepositoryWithProductionType(
  db: Db,
  clock: Clock,
): ProductionTypeProjectRepository {
  const base = createProjectRepository(db, clock);

  const readIdentity = (projectId: string): ProductionType | null => {
    const row = db
      .select({ productionType: projectProductionTypes.productionType })
      .from(projectProductionTypes)
      .where(eq(projectProductionTypes.projectId, projectId))
      .get();
    if (!row) return null;
    const parsed = productionTypeSchema.safeParse(row.productionType);
    return parsed.success ? parsed.data : null;
  };

  const attachIdentity = (project: ProjectRecord): ProductionTypeProjectRecord => ({
    ...project,
    productionType: readIdentity(project.id),
  });

  const writeIdentity = (projectId: string, productionType: ProductionType | null): void => {
    db.delete(projectProductionTypes).where(eq(projectProductionTypes.projectId, projectId)).run();
    if (productionType !== null) {
      db.insert(projectProductionTypes)
        .values({ projectId, productionType, updatedAt: clock.nowIso() })
        .run();
    }
  };

  return {
    async create(input) {
      const project = await base.create(input);
      if (input.productionType !== undefined && input.productionType !== null) {
        writeIdentity(project.id, input.productionType);
      }
      return attachIdentity(project);
    },

    async update(id, patch) {
      const project = await base.update(id, patch);
      if (patch.productionType !== undefined) {
        writeIdentity(project.id, patch.productionType);
      }
      return attachIdentity(project);
    },

    async byId(id) {
      const project = await base.byId(id);
      return project ? attachIdentity(project) : null;
    },

    async bySlug(slug) {
      const project = await base.bySlug(slug);
      return project ? attachIdentity(project) : null;
    },

    async list(options) {
      return (await base.list(options)).map(attachIdentity);
    },

    softDelete: (id) => base.softDelete(id),
    slugExists: (slug) => base.slugExists(slug),
  };
}
