'use client';

import { useEffect, useRef } from 'react';

export type FieldErrorMap = Record<string, string>;

/**
 * Top-level list of field-specific validation errors, auto-focused on
 * appearance so a keyboard/screen-reader user lands directly on it after a
 * failed submit instead of having to find the error themselves. Each entry
 * links to `#field-<name>` — callers must give their inputs matching ids
 * (`id={"field-" + name}`) for the link to actually land on the field.
 *
 * Reuses `ErrorState`'s exact colour tokens (src/components/ui.tsx) rather
 * than inventing a new error colour.
 */
export function ValidationSummary({
  errors,
  title = 'Check the highlighted fields',
  hrefSuffix = '',
}: {
  errors: FieldErrorMap;
  title?: string;
  /** Appended after the field name in each deep-link (e.g. `-${episode.id}`), for a form repeated per list row where every row's input ids are already suffixed to stay unique. Defaults to '', matching every single-instance caller unchanged. */
  hrefSuffix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors);
  const count = entries.length;

  useEffect(() => {
    if (count > 0) ref.current?.focus();
  }, [count]);

  if (count === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800 outline-none dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-200"
    >
      <p className="font-medium">
        <span aria-hidden="true">✕ </span>
        {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {entries.map(([field, message]) => (
          <li key={field}>
            <a href={`#field-${field}${hrefSuffix}`} className="underline hover:no-underline">
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Inline per-field error, paired with an input's `aria-describedby`. Shared
 * by every create form (Character, Location, ...) so the same accessible
 * error-text pattern isn't hand-rolled per form.
 */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}
