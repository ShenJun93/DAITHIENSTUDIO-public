'use client';

import type { CreativeEntitySummary } from '@/application/services/creativeWorkspaceService';
import { EmptyState } from '@/components/ui';
import { EntityCard } from './EntityCard';
import { InspectorPanel } from './InspectorPanel';
import { useInspectorSelection } from './useInspectorSelection';

/**
 * Selectable grid of entity cards plus a read-only Inspector for whichever
 * card is selected. Shared by the Character and Location Browser routes —
 * see docs/design/COMPONENT-GUIDELINES.md (EntityCard / EntityGrid /
 * InspectorPanel). Selection is local UI state, not persisted data.
 */
export function EntityBrowserView({
  entries,
  emptyTitle,
  emptyHint,
}: {
  entries: CreativeEntitySummary[];
  emptyTitle: string;
  emptyHint: string;
}) {
  const { selectedId, registerCard, toggle, close } = useInspectorSelection();
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  if (entries.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div className={selected ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Entity list">
        {entries.map((entry) => (
          <li key={entry.id} ref={(node) => registerCard(entry.id, node)}>
            <EntityCard entity={entry} selected={entry.id === selectedId} onSelect={() => toggle(entry.id)} />
          </li>
        ))}
      </ul>
      {selected && (
        <div className="lg:sticky lg:top-4 lg:self-start">
          <InspectorPanel entity={selected} onClose={close} />
        </div>
      )}
    </div>
  );
}
