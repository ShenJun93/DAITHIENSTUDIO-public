import { Card } from '@/components/ui';

export interface GenerationCostData {
  estimatedCostUsd: number;
  actualCostUsd: number;
}

export interface ShotCostSummaryProps {
  generations: GenerationCostData[];
}

export function ShotCostSummary({ generations }: ShotCostSummaryProps) {
  if (generations.length === 0) {
    return null;
  }

  const encumberedCost = generations.reduce((sum, g) => sum + g.estimatedCostUsd, 0);
  const actualCost = generations.reduce((sum, g) => sum + g.actualCostUsd, 0);

  return (
    <Card title="Cost summary">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="text-xs uppercase tracking-wide text-ink-lo">Encumbered</h3>
          <p className="mt-1 text-sm text-ink-mid">${encumberedCost.toFixed(4)}</p>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wide text-ink-lo">Actual</h3>
          <p className="mt-1 text-sm text-ink-mid">${actualCost.toFixed(4)}</p>
        </div>
      </div>
    </Card>
  );
}
