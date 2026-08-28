import { and, desc, eq } from 'drizzle-orm';
import type { Clock, PublishRepository } from '@/application/ports';
import type { PublishRecord } from '@/application/records';
import { notFound } from '@/domain/errors';
import { newId } from '@/domain/ids';
import type { Db } from './client';
import { publishes } from './schema';

function mapRecord(row: typeof publishes.$inferSelect): PublishRecord {
  return { ...row, status: row.status as PublishRecord['status'] };
}

export function createPublishRepo(db: Db, clock: Clock): PublishRepository {
  const load = async (id: string): Promise<PublishRecord> => {
    const row = await db.query.publishes.findFirst({ where: eq(publishes.id, id) });
    if (!row) throw notFound('Publish', id);
    return mapRecord(row);
  };

  return {
    async create(input) {
      const id = newId('pub');
      const now = clock.nowIso();
      await db.insert(publishes).values({ ...input, id, status: 'pending', attemptCount: 0, createdAt: now, updatedAt: now });
      return load(id);
    },

    async claimPublishAttempt(input) {
      return db.transaction(() => {
        const existing = db.select().from(publishes)
          .where(and(eq(publishes.projectId, input.projectId), eq(publishes.exportId, input.exportId), eq(publishes.endpoint, input.endpoint)))
          .orderBy(desc(publishes.createdAt))
          .get();
        
        if (existing) {
          const rec = mapRecord(existing);
          if (rec.status === 'completed') return { kind: 'ALREADY_DELIVERED', record: rec };
          if (rec.status === 'running' || rec.status === 'pending') return { kind: 'ALREADY_IN_PROGRESS', record: rec };
          return { kind: 'RETRYABLE_EXISTING', record: rec };
        }
        
        const id = newId('pub');
        const now = clock.nowIso();
        db.insert(publishes).values({ ...input, id, status: 'pending', attemptCount: 0, createdAt: now, updatedAt: now }).run();
        const created = db.select().from(publishes).where(eq(publishes.id, id)).get();
        if (!created) throw new Error('Failed to create publish record atomically');
        return { kind: 'CLAIMED', record: mapRecord(created) };
      });
    },

    async updateStatus(id, status, error) {
      await load(id);
      await db.update(publishes).set({
        status,
        lastError: error ?? null,
        updatedAt: clock.nowIso(),
      }).where(eq(publishes.id, id));
      return load(id);
    },

    async incrementAttempt(id) {
      const current = await load(id);
      await db.update(publishes).set({
        attemptCount: current.attemptCount + 1,
        updatedAt: clock.nowIso(),
      }).where(eq(publishes.id, id));
      return load(id);
    },

    async byId(id) {
      const row = await db.query.publishes.findFirst({ where: eq(publishes.id, id) });
      return row ? mapRecord(row) : null;
    },

    async findLatestByExportEndpoint(projectId, exportId, endpoint) {
      const row = await db.query.publishes.findFirst({
        where: and(eq(publishes.projectId, projectId), eq(publishes.exportId, exportId), eq(publishes.endpoint, endpoint)),
        orderBy: [desc(publishes.createdAt)],
      });
      return row ? mapRecord(row) : null;
    },

    async listByProject(projectId) {
      const rows = await db.query.publishes.findMany({
        where: eq(publishes.projectId, projectId),
        orderBy: [desc(publishes.createdAt)],
      });
      return rows.map(mapRecord);
    },
  };
}
