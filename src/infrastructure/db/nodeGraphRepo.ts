import { desc, eq } from 'drizzle-orm';
import type { Clock, NodeGraphRepository } from '@/application/ports';
import type { NodeGraphRecord } from '@/application/records';
import { DomainError, notFound } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { nodeGraphSchema } from '@/domain/schemas';
import type { Db } from './client';
import { nodeGraphs } from './schema';

function parseGraph(json: string): NodeGraphRecord['graph'] {
  try {
    return nodeGraphSchema.parse(JSON.parse(json));
  } catch {
    throw new DomainError('INTERNAL', 'Stored workflow graph is invalid.');
  }
}

function mapRecord(row: typeof nodeGraphs.$inferSelect): NodeGraphRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    graph: parseGraph(row.graphJson),
    status: row.status as NodeGraphRecord['status'],
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createNodeGraphRepo(db: Db, clock: Clock): NodeGraphRepository {
  const load = async (id: string): Promise<NodeGraphRecord> => {
    const row = await db.query.nodeGraphs.findFirst({ where: eq(nodeGraphs.id, id) });
    if (!row) throw notFound('Node graph', id);
    return mapRecord(row);
  };

  return {
    async create(input) {
      const id = newId('ng');
      const now = clock.nowIso();
      await db.insert(nodeGraphs).values({
        id, projectId: input.projectId, name: input.name, graphJson: JSON.stringify(input.graph),
        status: 'draft', version: 1, createdAt: now, updatedAt: now,
      });
      return load(id);
    },

    async update(id, input) {
      const current = await load(id);
      await db.update(nodeGraphs).set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.graph === undefined ? {} : { graphJson: JSON.stringify(input.graph), version: current.version + 1 }),
        updatedAt: clock.nowIso(),
      }).where(eq(nodeGraphs.id, id));
      return load(id);
    },

    async updateStatus(id, status) {
      await load(id);
      await db.update(nodeGraphs).set({ status, updatedAt: clock.nowIso() }).where(eq(nodeGraphs.id, id));
      return load(id);
    },

    async byId(id) {
      const row = await db.query.nodeGraphs.findFirst({ where: eq(nodeGraphs.id, id) });
      return row ? mapRecord(row) : null;
    },

    async listByProject(projectId) {
      const rows = await db.query.nodeGraphs.findMany({
        where: eq(nodeGraphs.projectId, projectId),
        orderBy: [desc(nodeGraphs.updatedAt)],
      });
      return rows.map(mapRecord);
    },

    async remove(id) {
      await load(id);
      await db.delete(nodeGraphs).where(eq(nodeGraphs.id, id));
    },
  };
}
