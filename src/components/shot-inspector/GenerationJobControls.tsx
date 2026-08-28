'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { GenerationStatus } from '@/domain/enums';
import { Button } from '@/components/ui';
import type { GenerationControlActionResult } from '@/app/generationActions';

export type GenerationControlMode = 'retry' | 'cancel' | null;

export function generationControlMode(status: GenerationStatus): GenerationControlMode {
  if (status === 'failed') return 'retry';
  if (status === 'pending') return 'cancel';
  return null;
}

export function GenerationJobControls({
  status,
  retryAction,
  cancelAction,
}: {
  status: GenerationStatus;
  retryAction?: () => Promise<GenerationControlActionResult>;
  cancelAction?: () => Promise<GenerationControlActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerationControlActionResult | null>(null);
  const mode = generationControlMode(status);

  if (!mode) return null;

  const action = mode === 'retry' ? retryAction : cancelAction;
  if (!action) return null;

  const run = (): void => {
    if (mode === 'cancel' && !window.confirm('Cancel this queued generation?')) return;
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={mode === 'cancel' ? 'danger' : 'ghost'}
        onClick={run}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (mode === 'retry' ? 'Retrying…' : 'Cancelling…') : mode === 'retry' ? 'Retry failed job' : 'Cancel queued job'}
      </Button>
      {result && (
        <span
          role={result.ok ? 'status' : 'alert'}
          className={`max-w-xs text-right text-xs ${
            result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
          }`}
        >
          {result.message}
          {result.code && !result.ok ? ` (${result.code})` : ''}
        </span>
      )}
    </div>
  );
}
