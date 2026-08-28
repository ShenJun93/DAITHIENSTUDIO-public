'use client';

import type { CreativeSceneSummary } from '@/application/services/creativeWorkspaceService';
import { SceneCard } from './SceneCard';
import { SceneInspector } from './SceneInspector';
import { SelectionBoard } from './SelectionBoard';

/** Selectable Scene Board grid plus a read-only Inspector. Scenes render in their existing sequence — no reorder. */
export function SceneBoardView({ scenes, slug }: { scenes: CreativeSceneSummary[]; slug: string }) {
  return (
    <SelectionBoard
      items={scenes}
      getId={(scene) => scene.id}
      ariaLabel="Scene list"
      emptyTitle="No scenes yet"
      emptyHint="Parse a script on the Script page to create scenes for this episode."
      renderCard={(scene, selected, onSelect) => <SceneCard scene={scene} selected={selected} onSelect={onSelect} />}
      renderInspector={(scene, onClose) => <SceneInspector scene={scene} slug={slug} onClose={onClose} />}
    />
  );
}
