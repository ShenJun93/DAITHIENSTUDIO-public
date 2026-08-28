import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * Fades and lifts content in once on mount. Approved use: first-load section
 * reveal only — never re-trigger per render (docs/design/MOTION-GUIDELINES.md).
 */
export function SectionReveal({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('animate-section-reveal', className)}>{children}</div>;
}
