import { Skeleton } from '@/components/ui/skeleton';

/**
 * A stack of Skeleton bars for a section that is loading. Approved use:
 * loading shimmer only (docs/design/MOTION-GUIDELINES.md).
 */
export function LoadingShimmer({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className={index === lines - 1 ? 'h-3 w-2/3' : 'h-3 w-full'} />
        ))}
      </div>
    </div>
  );
}
