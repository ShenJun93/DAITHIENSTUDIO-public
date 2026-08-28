/**
 * VC2 — Shot package summary (TASK-UI-VISUAL-CONTROL-001).
 * Shows the derived package fingerprint — the stable, decision-relevant identity
 * of the shot's visual package that a future VC8 approval would record against.
 * No render approval is recorded or asserted by VC2.
 */
import { Card } from '@/components/ui';

export function PackageSummary({ shotCode }: { shotCode: string }) {
  return (
    <Card title="Shot package">
      <p className="text-sm text-ink-mid">
        No render approval (VC8) is recorded for this package yet.
      </p>
    </Card>
  );
}
