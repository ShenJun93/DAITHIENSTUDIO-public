import { DomainError, notFound } from '@/domain/errors';
import { nodeGraphSchema, nonEmpty } from '@/domain/schemas';
import type { Studio } from '../ports';
import type { NodeGraphRecord } from '../records';

const graphNameSchema = nonEmpty.max(120);

export function createNodeGraphService(studio: Studio) {
  const requireOwned = async (projectId: string, id: string): Promise<NodeGraphRecord> => {
    const record = await studio.nodeGraphs.byId(id);
    if (!record || record.projectId !== projectId) throw notFound('Node graph', id);
    return record;
  };

  return {
    async create(projectId: string, name: string): Promise<NodeGraphRecord> {
      if (!(await studio.projects.byId(projectId))) throw notFound('Project', projectId);
      const parsedName = graphNameSchema.parse(name);
      const record = await studio.nodeGraphs.create({ projectId, name: parsedName, graph: { nodes: [], edges: [] } });
      await studio.activity.log({
        projectId, userId: null, action: 'node-graph.created', targetType: 'node-graph', targetId: record.id,
        details: { name: parsedName },
      });
      return record;
    },

    async save(projectId: string, id: string, graph: unknown): Promise<NodeGraphRecord> {
      const existing = await requireOwned(projectId, id);
      if (existing.status === 'locked') throw new DomainError('CONFLICT', 'Cannot edit a locked workflow graph.');
      const validated = nodeGraphSchema.parse(graph);
      const record = await studio.nodeGraphs.update(id, { graph: validated });
      await studio.activity.log({
        projectId, userId: null, action: 'node-graph.saved', targetType: 'node-graph', targetId: id,
        details: { version: record.version, nodeCount: validated.nodes.length, edgeCount: validated.edges.length },
      });
      return record;
    },

    async rename(projectId: string, id: string, name: string): Promise<NodeGraphRecord> {
      const existing = await requireOwned(projectId, id);
      if (existing.status === 'locked') throw new DomainError('CONFLICT', 'Cannot rename a locked workflow graph.');
      return studio.nodeGraphs.update(id, { name: graphNameSchema.parse(name) });
    },

    async lock(projectId: string, id: string): Promise<NodeGraphRecord> {
      await requireOwned(projectId, id);
      return studio.nodeGraphs.updateStatus(id, 'locked');
    },

    async get(projectId: string, id: string): Promise<NodeGraphRecord> {
      return requireOwned(projectId, id);
    },

    async list(projectId: string): Promise<NodeGraphRecord[]> {
      return studio.nodeGraphs.listByProject(projectId);
    },

    async remove(projectId: string, id: string): Promise<void> {
      const existing = await requireOwned(projectId, id);
      if (existing.status === 'locked') throw new DomainError('CONFLICT', 'Cannot delete a locked workflow graph.');
      await studio.nodeGraphs.remove(id);
    },
  };
}
