/**
 * VC2 — Asset review summary (TASK-UI-VISUAL-CONTROL-001).
 * Shows the shot's bound assets, their approval state and whether each is a
 * required reference contributing to package readiness.
 */
import type { AssetReviewState } from '@/domain/visualControl/types';
import { Badge, Card, EmptyState, StatusBadge } from '@/components/ui';

export function AssetReviewSummary({ assets }: { assets: AssetReviewState[] }) {
  const requiredCount = assets.filter((asset) => asset.isRequiredReference).length;
  return (
    <Card
      title="Bound assets"
      action={
        <span className="font-mono text-xs text-ink-lo">
          {assets.length} asset{assets.length === 1 ? '' : 's'} · {requiredCount} required
        </span>
      }
    >
      {assets.length === 0 ? (
        <EmptyState title="No bound assets" hint="Bound reference assets and generated shots appear here." />
      ) : (
        <ul className="space-y-1.5 text-sm">
          {assets.map((asset) => (
            <li key={asset.assetId} className="flex flex-wrap items-center gap-2">
              <StatusBadge status={asset.approvalState} />
              <Badge>{asset.kind}</Badge>
              <span className="min-w-0 truncate text-ink-hi" title={asset.name}>
                {asset.name}
              </span>
              {asset.boundRole && <span className="font-mono text-[11px] text-ink-lo">{asset.boundRole}</span>}
              {asset.isRequiredReference && !asset.contributesToReadiness && (
                <span className="text-xs text-warning">not approved for readiness</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
