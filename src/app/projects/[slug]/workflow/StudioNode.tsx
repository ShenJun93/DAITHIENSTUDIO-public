'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const NODE_COLORS: Record<string, string> = {
  'generate-image': 'border-indigo-500 bg-indigo-500/10',
  'generate-voice': 'border-violet-500 bg-violet-500/10',
  'generate-video': 'border-sky-500 bg-sky-500/10',
  'composite-video': 'border-amber-500 bg-amber-500/10',
  'check-continuity': 'border-emerald-500 bg-emerald-500/10',
  'approve-asset': 'border-green-500 bg-green-500/10',
  'export-package': 'border-rose-500 bg-rose-500/10',
};

const NODE_ICONS: Record<string, string> = {
  'generate-image': '🎨',
  'generate-voice': '🎙️',
  'generate-video': '🎬',
  'composite-video': '🎞️',
  'check-continuity': '🔍',
  'approve-asset': '✅',
  'export-package': '📦',
};

function StudioNodeComponent({ data }: NodeProps) {
  const opType = (data?.operationType as string) ?? 'generate-image';
  const colorClass = NODE_COLORS[opType] ?? 'border-gray-500 bg-gray-500/10';
  const icon = NODE_ICONS[opType] ?? '⚙️';
  const label = (data?.label as string) ?? opType;

  return (
    <div className={`rounded-lg border-2 ${colorClass} px-3 py-2 min-w-[140px] shadow-md`} aria-label={`${label} node`} role="group">
      <Handle type="target" position={Position.Top} className="!bg-ink-mid !w-2.5 !h-2.5" />

      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-medium text-ink-hi">{label}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-ink-mid !w-2.5 !h-2.5" />
    </div>
  );
}

export const StudioNode = memo(StudioNodeComponent);
