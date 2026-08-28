'use client';

/**
 * Runs a bound server action and reports the outcome inline.
 *
 * Every mutation in the UI goes through this, which is how "the user always
 * knows whether the data was saved" (rule 04) is guaranteed rather than hoped
 * for: pending, success and failure are all rendered, never silent.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/app/actions';
import { Button } from './ui';

export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = 'primary',
  confirm,
  disabled,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel?: string;
  variant?: 'primary' | 'ghost' | 'danger';
  confirm?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (): void => {
    if (confirm && !window.confirm(confirm)) return;
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      if (outcome.ok && outcome.redirectTo) {
        router.push(outcome.redirectTo);
        return;
      }
      setResult(outcome);
    });
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant={variant} onClick={run} disabled={pending || disabled} aria-busy={pending}>
        {pending ? (pendingLabel ?? 'Working…') : label}
      </Button>
      {result && (
        <span
          role={result.ok ? 'status' : 'alert'}
          className={`max-w-md text-xs ${
            result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
          }`}
        >
          <span aria-hidden="true">{result.ok ? '✓ ' : '✕ '}</span>
          {result.message}
          {result.code && !result.ok ? ` (${result.code})` : ''}
        </span>
      )}
    </span>
  );
}
