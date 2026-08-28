/**
 * VC2 — Visual Control error state (TASK-UI-VISUAL-CONTROL-001).
 * Rendered when the VC1 read model cannot be gathered for a shot. The section
 * degrades to this read-only card instead of blocking the Shot Inspector page.
 */
import { ErrorState } from '@/components/ui';

export function VisualControlError({ reason }: { reason: string }) {
  return (
    <section aria-labelledby="visual-control-heading" className="space-y-3">
      <h2 id="visual-control-heading" className="text-lg font-semibold text-ink-hi">
        Visual Control
      </h2>
      <ErrorState title="Visual control evidence unavailable" detail={reason} />
    </section>
  );
}
