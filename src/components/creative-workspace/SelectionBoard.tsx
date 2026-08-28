'use client';

import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui';
import { useInspectorSelection } from './useInspectorSelection';

/**
 * Generic selectable grid + Inspector shell, shared by the Scene Board and
 * Shot Storyboard. Deliberately separate from `EntityBrowserView.tsx`
 * (Slice 2's Character/Location browsers) rather than a shared refactor of
 * it — the active task manifest authorizes reusing/extending the Inspector
 * pattern but not redesigning the Slice 2 browsers, so this generalizes
 * only the selection/keyboard/layout mechanics that both need, via
 * `useInspectorSelection`.
 */
export function SelectionBoard<T>({
  items,
  getId,
  renderCard,
  renderInspector,
  emptyTitle,
  emptyHint,
  ariaLabel,
}: {
  items: T[];
  getId: (item: T) => string;
  renderCard: (item: T, selected: boolean, onSelect: () => void) => ReactNode;
  renderInspector: (item: T, onClose: () => void) => ReactNode;
  emptyTitle: string;
  emptyHint: string;
  ariaLabel: string;
}) {
  const { selectedId, registerCard, toggle, close } = useInspectorSelection();
  const selected = items.find((item) => getId(item) === selectedId) ?? null;

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div className={selected ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={ariaLabel}>
        {items.map((item) => {
          const id = getId(item);
          return (
            <li key={id} ref={(node) => registerCard(id, node)}>
              {renderCard(item, id === selectedId, () => toggle(id))}
            </li>
          );
        })}
      </ul>
      {selected && <div className="lg:sticky lg:top-4 lg:self-start">{renderInspector(selected, close)}</div>}
    </div>
  );
}
