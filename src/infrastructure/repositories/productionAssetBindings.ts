import { and, asc, eq } from 'drizzle-orm';
import { newId } from '@/domain/ids';
import { notFound } from '@/domain/errors';
import type { Clock, ProductionAssetBindingRepository } from '@/application/ports';
import type { Db } from '../db/client';
import { productionAssetBindings } from '../db/schema';
import { toProductionAssetBinding } from './mappers';

export function createProductionAssetBindingRepository(
  db: Db,
  clock: Clock,
): ProductionAssetBindingRepository {
  return {
    async bind(input) {
      const existing = db
        .select()
        .from(productionAssetBindings)
        .where(
          and(
            eq(productionAssetBindings.assetId, input.assetId),
            eq(productionAssetBindings.targetType, input.targetType),
            eq(productionAssetBindings.targetId, input.targetId),
            eq(productionAssetBindings.targetVersionId, input.targetVersionId),
            eq(productionAssetBindings.role, input.role),
          ),
        )
        .get();
      if (existing) return toProductionAssetBinding(existing);

      const id = newId('pab');
      db.insert(productionAssetBindings)
        .values({ ...input, id, createdAt: clock.nowIso() })
        .run();
      const row = db.select().from(productionAssetBindings).where(eq(productionAssetBindings.id, id)).get();
      if (!row) throw notFound('ProductionAssetBinding', id);
      return toProductionAssetBinding(row);
    },

    async listByProject(projectId) {
      return db
        .select()
        .from(productionAssetBindings)
        .where(eq(productionAssetBindings.projectId, projectId))
        .orderBy(asc(productionAssetBindings.createdAt))
        .all()
        .map(toProductionAssetBinding);
    },

    async listByTarget(projectId, targetType, targetId) {
      return db
        .select()
        .from(productionAssetBindings)
        .where(
          and(
            eq(productionAssetBindings.projectId, projectId),
            eq(productionAssetBindings.targetType, targetType),
            eq(productionAssetBindings.targetId, targetId),
          ),
        )
        .orderBy(asc(productionAssetBindings.createdAt))
        .all()
        .map(toProductionAssetBinding);
    },
  };
}
