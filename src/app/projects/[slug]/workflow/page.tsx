/** Workflow orchestration page — constrained node canvas (ADR-007). */
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createNodeGraphService } from '@/application/services/nodeGraphService';
import { createNodeGraphAction } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { Card, EmptyState } from '@/components/ui';
import { NodeCanvasWrapper } from './NodeCanvasWrapper';

export const dynamic = 'force-dynamic';

export default async function WorkflowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const graphs = await createNodeGraphService(studio).list(project.id);

  return (
    <div className="space-y-5">
      <Card
        title={`Workflows (${graphs.length})`}
        action={
          <ActionButton
            action={createNodeGraphAction.bind(null, slug, 'New workflow')}
            label="+ New workflow"
            variant="primary"
          />
        }
      >
        {graphs.length === 0 ? (
          <EmptyState
            title="No workflows yet"
            hint="Create a workflow to visually orchestrate your production pipeline."
          />
        ) : (
          <div className="space-y-4">
            {graphs.map((graph) => (
              <div key={graph.id} className="border border-line rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-surface-alt border-b border-line">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-hi">{graph.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      graph.status === 'locked'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {graph.status}
                    </span>
                    <span className="text-xs text-ink-lo">
                      {graph.graph.nodes.length} nodes · {graph.graph.edges.length} edges
                    </span>
                  </div>
                  <span className="text-xs text-ink-lo">
                    v{graph.version} · {new Date(graph.updatedAt).toLocaleString()}
                  </span>
                </div>
                <div className="h-[500px]">
                  <NodeCanvasWrapper
                    slug={slug}
                    graphId={graph.id}
                    initialNodes={graph.graph.nodes}
                    initialEdges={graph.graph.edges}
                    locked={graph.status === 'locked'}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
