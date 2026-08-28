/**
 * Advisory — M9 initial slice (read/analyze/propose only).
 *
 * Purely informational: renders suggestions grouped by kind, derived from
 * real project signals. No action button, form, or Server Action anywhere
 * on this page — an operator reads a suggestion and acts on it through the
 * product's existing, unchanged screens, exactly like ADR-014 SS1.1 scopes
 * this slice.
 */
import { getStudio } from '@/infrastructure/container';
import { createAdvisoryService } from '@/application/services/advisoryService';
import { Badge, Card, EmptyState } from '@/components/ui';
import type { ProductionAdvisorySuggestion } from '@/domain/schemas';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<ProductionAdvisorySuggestion['kind'], string> = {
  continuity: 'Continuity',
  'risk-cost': 'Risk / Cost',
  'next-action': 'Next Action',
  'script-scene-shot': 'Script / Scene / Shot',
  prompt: 'Prompt',
};

export default async function AdvisoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const advisory = createAdvisoryService(studio);
  const suggestions = await advisory.getSuggestions(slug);

  return (
    <div className="space-y-5">
      <Card title="Advisory suggestions">
        <p className="mb-4 text-sm text-ink-mid">
          Read-only suggestions derived from this project&apos;s current state. Nothing on this page changes any
          production data — review a suggestion, then act on it through the studio&apos;s normal screens if you agree.
        </p>
        {suggestions.length === 0 ? (
          <EmptyState
            title="No suggestions right now"
            hint="The advisor has no continuity, cost or readiness signals to raise for this project at the moment."
          />
        ) : (
          <ul className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <li key={`${suggestion.kind}-${index}`} className="rounded-lg border border-line p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge>{KIND_LABEL[suggestion.kind]}</Badge>
                </div>
                <p className="text-sm font-medium text-ink-hi">{suggestion.message}</p>
                <p className="mt-1 text-xs text-ink-mid">{suggestion.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
