'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Panel,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { saveNodeGraphAction, deleteNodeGraphAction } from '@/app/actions';
import { NODE_OPERATION_TYPES, type GraphEdge, type GraphNode, type NodeOperationType } from '@/domain/schemas';
import { StudioNode } from './StudioNode';

interface NodeCanvasWrapperProps {
  slug: string;
  graphId: string;
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  locked: boolean;
}

export function NodeCanvasWrapper({
  slug,
  graphId,
  initialNodes,
  initialEdges,
  locked,
}: NodeCanvasWrapperProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [edgeSource, setEdgeSource] = useState('');
  const [edgeTarget, setEdgeTarget] = useState('');
  const router = useRouter();

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      'generate-image': StudioNode,
      'generate-voice': StudioNode,
      'generate-video': StudioNode,
      'composite-video': StudioNode,
      'check-continuity': StudioNode,
      'approve-asset': StudioNode,
      'export-package': StudioNode,
    }),
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (locked) return;
      if (edges.length >= 100) {
        setMessageIsError(true);
        setMessage('A workflow can contain at most 100 edges.');
        return;
      }
      setEdges((eds) => addEdge(connection, eds));
    },
    [edges.length, locked, setEdges],
  );

  const addNode = useCallback(
    (type: NodeOperationType) => {
      if (locked) return;
      if (nodes.length >= 50) {
        setMessageIsError(true);
        setMessage('A workflow can contain at most 50 nodes.');
        return;
      }
      const id = `node_${crypto.randomUUID()}`;
      const newNode: Node = {
        id,
        type,
        position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 },
        data: { label: type, operationType: type },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [locked, nodes.length, setNodes],
  );

  const addAccessibleEdge = useCallback(() => {
    if (locked || !edgeSource || !edgeTarget) return;
    if (edgeSource === edgeTarget) {
      setMessageIsError(true);
      setMessage('An edge must connect two different nodes.');
      return;
    }
    if (edges.length >= 100) {
      setMessageIsError(true);
      setMessage('A workflow can contain at most 100 edges.');
      return;
    }
    setEdges((current) => [...current, {
      id: `edge_${crypto.randomUUID()}`, source: edgeSource, target: edgeTarget,
      sourceHandle: null, targetHandle: null,
    }]);
    setEdgeSource('');
    setEdgeTarget('');
    setMessageIsError(false);
    setMessage('Connection added. Save to persist it.');
  }, [edgeSource, edgeTarget, edges.length, locked, setEdges]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const graph = {
        nodes: nodes.map((node) => ({ id: node.id, type: node.type, position: node.position, data: node.data })),
        edges: edges.map((edge) => ({
          id: edge.id, source: edge.source, sourceHandle: edge.sourceHandle ?? null,
          target: edge.target, targetHandle: edge.targetHandle ?? null,
        })),
      };
      const result = await saveNodeGraphAction(slug, graphId, graph);
      setMessageIsError(!result.ok);
      setMessage(result.ok ? 'Saved ✓' : (result.message ?? 'Error'));
    } catch {
      setMessage('Save failed');
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, slug, graphId]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this workflow?')) return;
    setDeleting(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const result = await deleteNodeGraphAction(slug, graphId);
      setMessage(result.message ?? (result.ok ? 'Workflow deleted.' : 'Delete failed.'));
      setMessageIsError(!result.ok);
      if (result.ok) router.refresh();
    } catch {
      setMessage('Delete failed');
      setMessageIsError(true);
    } finally {
      setDeleting(false);
    }
  }, [slug, graphId, router]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={locked ? undefined : onNodesChange}
      onEdgesChange={locked ? undefined : onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
      className="bg-surface"
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
      <MiniMap
        nodeColor={() => '#6366f1'}
        maskColor="rgba(0,0,0,0.6)"
        className="!bg-surface-alt !border-line"
      />

      <Panel position="top-left">
        <div className="flex flex-wrap gap-1 p-2 bg-surface-alt/90 backdrop-blur rounded-lg border border-line shadow-lg" role="toolbar" aria-label="Add nodes">
          {!locked && NODE_OPERATION_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="px-2 py-1 text-xs rounded bg-brand/20 text-brand hover:bg-brand/30 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 focus:ring-offset-surface-1"
              aria-label={`Add ${type} node`}
            >
              + {type}
            </button>
          ))}
        </div>
      </Panel>

      <Panel position="top-right">
        <div className="flex items-center gap-2 p-2 bg-surface-alt/90 backdrop-blur rounded-lg border border-line shadow-lg" role="toolbar" aria-label="Workflow actions">
          {!locked && (
            <button
              onClick={handleSave}
              disabled={saving}
              aria-busy={saving}
              className="px-3 py-1 text-xs rounded bg-brand text-surface-0 hover:bg-brand/80 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 focus:ring-offset-surface-1"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {!locked && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-busy={deleting}
              className="px-3 py-1 text-xs rounded bg-rose-600 text-white hover:bg-rose-500 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 focus:ring-offset-surface-1"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          {locked && (
            <span className="text-xs text-emerald-400 font-medium">🔒 Locked</span>
          )}
          {message && (
            <span
              className={`text-xs ${messageIsError ? 'text-red-400' : 'text-ink-mid'}`}
              role={messageIsError ? 'alert' : 'status'}
              aria-live="polite"
            >
              {message}
            </span>
          )}
        </div>
      </Panel>

      {!locked && nodes.length > 1 && (
        <Panel position="bottom-left">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-alt/90 p-2 shadow-lg" role="group" aria-label="Add connection without dragging">
            <label className="text-xs text-ink-mid">
              From
              <select aria-label="Connection source node" value={edgeSource} onChange={(event) => setEdgeSource(event.target.value)} className="ml-1 rounded border border-line bg-surface px-1 py-0.5">
                <option value="">Select</option>
                {nodes.map((node) => <option key={node.id} value={node.id}>{String(node.data.label ?? node.id)}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-mid">
              To
              <select aria-label="Connection target node" value={edgeTarget} onChange={(event) => setEdgeTarget(event.target.value)} className="ml-1 rounded border border-line bg-surface px-1 py-0.5">
                <option value="">Select</option>
                {nodes.map((node) => <option key={node.id} value={node.id}>{String(node.data.label ?? node.id)}</option>)}
              </select>
            </label>
            <button type="button" onClick={addAccessibleEdge} disabled={!edgeSource || !edgeTarget} className="rounded bg-brand px-2 py-1 text-xs text-surface-0 disabled:opacity-50">
              Add connection
            </button>
          </div>
        </Panel>
      )}
    </ReactFlow>
  );
}
