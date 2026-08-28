'use client';

import { useState } from 'react';

export function CopyAuditValue({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
      setFailed(true);
      window.setTimeout(() => setFailed(false), 1200);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded border px-2 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        failed
          ? 'border-red-400 bg-red-50 text-red-600 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-400'
          : 'border-line bg-surface-2 text-ink-mid hover:text-ink-hi'
      }`}
      aria-label={failed ? `Failed to copy ${label}: ${value}` : copied ? `Copied ${label}: ${value}` : `${label}: ${value}`}
    >
      {failed ? 'Failed to copy' : copied ? 'Copied' : label}
    </button>
  );
}
