'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Shared selection state for a card grid + Inspector: tracks the selected
 * id, closes on Escape, and returns keyboard focus to the originating
 * card's `<button>` after close. Fixes the focus-return gap deferred from
 * Slice 2 (`EntityBrowserView.tsx`), now shared with the Slice 3 Scene
 * Board and Shot Storyboard instead of being duplicated per board.
 */
export function useInspectorSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  function registerCard(id: string, node: HTMLElement | null) {
    if (node) cardRefs.current.set(id, node);
    else cardRefs.current.delete(id);
  }

  function close() {
    const id = selectedId;
    setSelectedId(null);
    if (!id) return;
    const container = cardRefs.current.get(id);
    const button = container?.querySelector('button');
    if (button instanceof HTMLElement) {
      requestAnimationFrame(() => button.focus());
    }
  }

  function toggle(id: string) {
    setSelectedId((current) => (current === id ? null : id));
  }

  useEffect(() => {
    if (!selectedId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // close() intentionally omitted: it only reads selectedId (already the
    // effect's dependency) and stable refs/setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return { selectedId, registerCard, toggle, close };
}
