import { cn } from './cn';

/**
 * Pulsing loading block. Uses Tailwind's `animate-pulse`; the global
 * `prefers-reduced-motion` rule in globals.css collapses it to a static block
 * for users who asked for reduced motion, so no separate fallback prop is
 * needed. See docs/design/MOTION-GUIDELINES.md ("loading shimmer").
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
    />
  );
}
