'use client';

import type { CreativeShotSummary } from '@/application/services/creativeWorkspaceService';
import { ShotCard } from './ShotCard';
import { ShotInspector } from './ShotInspector';
import { SelectionBoard } from './SelectionBoard';

/** Selectable Shot Storyboard grid plus a read-only Inspector. Shots render in their existing sortIndex order — no reorder. */
export function ShotStoryboardView({ shots, emptyTitle, emptyHint }: { shots: CreativeShotSummary[]; emptyTitle: string; emptyHint: string }) {
  return (
    <SelectionBoard
      items={shots}
      getId={(shot) => shot.id}
      ariaLabel="Shot list"
      emptyTitle={emptyTitle}
      emptyHint={emptyHint}
      renderCard={(shot, selected, onSelect) => <ShotCard shot={shot} selected={selected} onSelect={onSelect} />}
      renderInspector={(shot, onClose) => <ShotInspector shot={shot} onClose={onClose} />}
    />
  );
}
