import type { ReactNode } from 'react';

export function TechnicalDisclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-lg border border-line bg-surface-1">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink-hi focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset">
        {title}
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}
