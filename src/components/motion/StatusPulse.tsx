import { cn } from '@/components/ui/cn';

const TONE = {
  info: 'bg-info',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
} as const;

/**
 * A pulsing dot next to a required text label, for a genuinely active
 * process (a running generation job, an in-flight render). Approved use:
 * render/generation status only — never a permanent decorative indicator
 * (docs/design/MOTION-GUIDELINES.md). Status is still text-first: the label
 * is mandatory, the dot is a supporting cue.
 */
export function StatusPulse({ label, tone = 'info' }: { label: string; tone?: keyof typeof TONE }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-mid">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', TONE[tone])} />
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', TONE[tone])} />
      </span>
      {label}
    </span>
  );
}
