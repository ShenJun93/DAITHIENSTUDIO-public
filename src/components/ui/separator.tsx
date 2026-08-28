import { cn } from './cn';

/**
 * Static divider. No `@radix-ui/react-separator` dependency: this primitive
 * has no interaction or focus behaviour, so plain markup is sufficient (see
 * the shadcn/ui audit table in docs/design/COMPONENT-GUIDELINES.md).
 */
export function Separator({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-line',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}
