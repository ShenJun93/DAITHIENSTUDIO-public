import type { ReactNode } from 'react';

/**
 * Groups related fields under one labelled heading. Replaces the ad hoc
 * `<div className="text-xs font-medium uppercase ...">` heading repeated in
 * CharacterBibleForm.tsx/LocationBibleForm.tsx with a real `<fieldset>` so
 * assistive technology announces the grouping, not just a visual label.
 */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-3 sm:col-span-2">
      <div>
        <legend className="text-xs font-medium uppercase tracking-wide text-ink-lo">{title}</legend>
        {hint && <p className="mt-0.5 text-xs text-ink-mid">{hint}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
