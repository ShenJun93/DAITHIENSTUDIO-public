'use client';

/**
 * VC3 (TASK-UI-VISUAL-CONTROL-001) — one repin control for a shot-level
 * Character/Location/Prop version pin, rendered inside the Visual Control
 * section. Read-only review plus a controlled version selector: the options
 * are exactly the versions that belong to the selected entity (assembled
 * server-side), the pending change is announced before persistence, an
 * existing valid pin requires confirmation before replacement, and success or
 * failure feedback is perceivable. On success the server action revalidates
 * the Shot Inspector, so the Visual Control read model is re-derived and the
 * stale pin evidence disappears.
 */
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import {
  isRepinChange,
  pendingRepinText,
  shouldConfirmRepin,
  type RepinActionResult,
  type RepinVersionOption,
} from './visualControlRepin';

export interface ReferenceRepinControlProps {
  kind: 'character' | 'location' | 'prop';
  refId: string;
  code: string;
  name: string;
  currentVersionId: string | null;
  resolved: boolean;
  resolvableReason: 'NO_PIN' | 'MISSING_REFERENCE' | null;
  versions: RepinVersionOption[];
  action: (formData: FormData) => Promise<RepinActionResult>;
}

export function ReferenceRepinControl({
  kind,
  refId,
  code,
  name,
  currentVersionId,
  resolved,
  resolvableReason,
  versions,
  action,
}: ReferenceRepinControlProps) {
  const selectId = useId();
  const pendingRef = useRef<HTMLSpanElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RepinActionResult | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(currentVersionId ?? versions[0]?.versionId ?? '');

  // After a successful repin the read model refreshes and `currentVersionId`
  // arrives at the new value; keep the selector in sync with the persisted pin.
  useEffect(() => {
    setSelectedVersionId((previous) =>
      previous === currentVersionId || !currentVersionId ? currentVersionId ?? '' : previous,
    );
  }, [currentVersionId]);

  const change = isRepinChange(currentVersionId, selectedVersionId);
  const confirmRequired = shouldConfirmRepin(currentVersionId, resolved);

  const run = (): void => {
    if (!selectedVersionId) return;
    if (confirmRequired && !window.confirm(`Replace the current ${kind} pin (${currentVersionId}) with ${selectedVersionId}?`)) {
      return;
    }
    setResult(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('kind', kind);
      form.set(kind === 'character' ? 'characterId' : kind === 'location' ? 'locationId' : 'propId', refId);
      form.set('versionId', selectedVersionId);
      const outcome = await action(form);
      setResult(outcome);
    });
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5">
      <span className="min-w-0 flex-1">
        <label htmlFor={selectId} className="block text-[11px] uppercase tracking-wide text-ink-lo">
          Version for {code}
        </label>
        <select
          id={selectId}
          value={selectedVersionId}
          onChange={(event) => setSelectedVersionId(event.target.value)}
          disabled={pending || versions.length === 0}
          className="mt-0.5 w-full max-w-xs rounded border border-line bg-surface-1 px-2 py-1 text-sm text-ink-hi disabled:opacity-60 sm:w-auto"
        >
          {versions.length === 0 ? (
            <option value="">No bible versions saved</option>
          ) : (
            versions.map((option) => (
              <option key={option.versionId} value={option.versionId}>
                {option.label}
              </option>
            ))
          )}
        </select>
      </span>

      <span className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="ghost"
          onClick={run}
          disabled={pending || versions.length === 0 || !selectedVersionId || !change}
          aria-busy={pending}
        >
          {pending ? 'Repinning…' : change ? 'Repin' : 'Repinned'}
        </Button>
        <span
          ref={pendingRef}
          role="status"
          aria-live="polite"
          className="max-w-md text-xs text-ink-mid"
        >
          {pending
            ? `Repinning ${kind} ${code}…`
            : change
              ? pendingRepinText(kind, code, currentVersionId, selectedVersionId)
              : `${kind} ${code} is pinned to ${currentVersionId ?? 'nothing'}${resolved ? '' : resolvableReason === 'MISSING_REFERENCE' ? ' (snapshot unresolved)' : ''}.`}
        </span>
      </span>

      {result && (
        <span
          role={result.ok ? 'status' : 'alert'}
          aria-live="polite"
          className={`max-w-md text-xs ${result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
        >
          <span aria-hidden="true">{result.ok ? '✓ ' : '✕ '}</span>
          {result.message}
          {result.code && !result.ok ? ` (${result.code})` : ''}
        </span>
      )}
    </div>
  );
}
