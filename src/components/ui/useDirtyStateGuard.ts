'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal dirty-state protection for a create/edit form.
 *
 * Guards native tab-close/reload via `beforeunload` — a real browser API,
 * not a hack. Next.js App Router has no public API to intercept an in-app
 * `<Link>` click or a `router.push` call (unlike the old Pages Router's
 * `router.events`), so cross-route blocking is intentionally not attempted
 * here: callers must gate their own "Cancel"/navigate actions with
 * `confirmDiscard()`, which uses the standard `window.confirm()` dialog —
 * a real, well-supported browser API, not a brittle popstate/history hack.
 * See docs/tasks/TASK-UI-CORE-EDITORS-001.md "Deliverable 5" for why this
 * is the deliberate scope boundary, not an oversight.
 */
export function useDirtyStateGuard() {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const markDirty = useCallback(() => setDirty(true), []);
  const markClean = useCallback(() => setDirty(false), []);
  const confirmDiscard = useCallback(
    (message = 'Discard unsaved changes?') => !dirty || window.confirm(message),
    [dirty],
  );

  return { dirty, markDirty, markClean, confirmDiscard };
}
