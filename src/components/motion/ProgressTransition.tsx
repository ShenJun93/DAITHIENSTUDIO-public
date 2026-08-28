import { cn } from '@/components/ui/cn';

/**
 * A determinate progress bar whose fill animates toward a new percentage.
 * Approved use: job/render progress updates and command-palette-style
 * transitions. `percent` is clamped to [0, 100]; the numeric value is always
 * rendered as text too, never colour/width alone.
 */
export function ProgressTransition({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-xs text-ink-mid">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(clamped)}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn('h-full origin-left rounded-full bg-brand transition-transform duration-base ease-standard')}
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
    </div>
  );
}
