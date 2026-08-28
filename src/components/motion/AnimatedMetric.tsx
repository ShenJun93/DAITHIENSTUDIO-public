import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * Fades a metric value in once on mount — a subtle confirmation that a
 * number just changed (e.g. a readiness count after a fresh read). Approved
 * use: subtle success/update confirmation only, not every render. To
 * re-trigger when the value changes, the caller sets `key={value}` on this
 * component (React remounts on key change; this component cannot detect a
 * prop change on itself).
 */
export function AnimatedMetric({ value, className }: { value: ReactNode; className?: string }) {
  return <span className={cn('animate-metric-in inline-block tabular-nums', className)}>{value}</span>;
}
