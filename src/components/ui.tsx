/**
 * Shared UI primitives.
 *
 * Deliberately small and unstyled-by-default: the studio needs dense, legible
 * production screens, not a component library. Every state a screen can be in
 * (loading / empty / error / success) has a primitive here so no page invents
 * its own.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-line bg-surface-1 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink-hi">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-1 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-lo">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-hi">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-mid">{hint}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, { glyph: string; tone: string }> = {
  planned: { glyph: '○', tone: 'text-ink-mid border-line' },
  prompted: { glyph: '◐', tone: 'text-brand border-brand' },
  generating: { glyph: '◍', tone: 'text-amber-600 border-amber-500 dark:text-amber-400' },
  pending: { glyph: '○', tone: 'text-ink-mid border-line' },
  processing: { glyph: '◍', tone: 'text-amber-600 border-amber-500 dark:text-amber-400' },
  review: { glyph: '◔', tone: 'text-violet-700 border-violet-400 dark:text-violet-300' },
  approved: { glyph: '✓', tone: 'text-emerald-700 border-emerald-500 dark:text-emerald-400' },
  completed: { glyph: '✓', tone: 'text-emerald-700 border-emerald-500 dark:text-emerald-400' },
  rendered: { glyph: '✓', tone: 'text-emerald-700 border-emerald-500 dark:text-emerald-400' },
  rejected: { glyph: '✕', tone: 'text-red-700 border-red-500 dark:text-red-400' },
  failed: { glyph: '✕', tone: 'text-red-700 border-red-500 dark:text-red-400' },
  cancelled: { glyph: '⊘', tone: 'text-ink-lo border-line' },
  error: { glyph: '✕', tone: 'text-red-700 border-red-500 dark:text-red-400' },
  warning: { glyph: '⚠', tone: 'text-amber-700 border-amber-500 dark:text-amber-400' },
  info: { glyph: 'ℹ', tone: 'text-brand border-brand' },
};

/** Status is text + glyph + colour, never colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? { glyph: '•', tone: 'text-ink-mid border-line' };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${style.tone}`}
    >
      <span aria-hidden="true">{style.glyph}</span>
      {status}
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-mid">
      {children}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-hi">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-ink-mid">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-200"
    >
      <p className="font-medium">
        <span aria-hidden="true">✕ </span>
        {title}
      </p>
      {detail && <p className="mt-1 whitespace-pre-wrap text-red-700 dark:text-red-300">{detail}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'info' | 'warning' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'border-line bg-surface-2 text-ink-mid',
    warning: 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-200',
    success:
      'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-950/30 dark:text-emerald-200',
  }[tone];
  return <div role="status" aria-live="polite" className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function Button({
  children,
  variant = 'primary',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-brand text-surface-0 hover:opacity-90',
    ghost: 'border border-line bg-surface-1 text-ink-hi hover:bg-surface-2',
    danger: 'border border-red-400 bg-transparent text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40',
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-ink-lo">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-ink-mid">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-md border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-hi placeholder:text-ink-lo';

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-lo">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-ink-hi hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink-mid">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function DataTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-lo">
            {head.map((label) => (
              <th key={label} className="px-2 py-2 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function SavedIndicator({ savedAt }: { savedAt: string | null }) {
  return (
    <span className="text-xs text-ink-lo" aria-live="polite">
      {savedAt ? `Saved · ${new Date(savedAt).toLocaleString()}` : 'Not saved yet'}
    </span>
  );
}
