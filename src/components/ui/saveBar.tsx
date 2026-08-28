'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui';

/**
 * Shared Save/Cancel row with an inline status message, replacing the
 * inline `<Button type="submit">` + status-text pattern each existing bible
 * form (CharacterBibleForm.tsx, LocationBibleForm.tsx, ...) re-implements
 * on its own. Composes the existing `Button` primitive only — no new
 * button variant, no new colour.
 */
export function SaveBar({
  pending,
  idleLabel,
  savingLabel,
  onCancel,
  cancelLabel = 'Cancel',
  status,
}: {
  pending: boolean;
  idleLabel: string;
  savingLabel: string;
  onCancel?: () => void;
  cancelLabel?: string;
  status?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? savingLabel : idleLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
      {status && (
        <span className="text-xs text-ink-lo" role="status" aria-live="polite">
          {status}
        </span>
      )}
    </div>
  );
}
