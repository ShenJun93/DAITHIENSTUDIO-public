import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * One-to-one persisted identity for the Project aggregate.
 *
 * Absence of a row means the project has no explicit production type. This
 * gives existing projects a natural `null` identity without a destructive or
 * guessed backfill from Project.format. The migration owns the FK/cascade;
 * this focused mapping is used only for identity reads/writes.
 */
export const projectProductionTypes = sqliteTable('project_production_types', {
  projectId: text('project_id').primaryKey(),
  productionType: text('production_type').notNull(),
  updatedAt: text('updated_at').notNull(),
});
