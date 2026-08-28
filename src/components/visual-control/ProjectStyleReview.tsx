/**
 * VC3 (TASK-UI-VISUAL-CONTROL-001) — read-only project-level Style review.
 *
 * Style has no shot-level pin; it lives on the project (`projects.styleId`)
 * and is represented in compiled prompts by the prompt-version lock
 * references. This card therefore shows the PROJECT's style — exact code and
 * current resolved version — with an explicit "project-level" indicator so an
 * operator never mistakes it for a shot pin. There is deliberately NO repin
 * control here: VC3 does not authorize mutating `projects.styleId` or prompt
 * lock references.
 */
import type { ProjectStyleReviewState } from './visualControlRepin';
import { Badge, Card, EmptyState } from '@/components/ui';
import { EvidenceStatusBadge } from './EvidenceStatusBadge';

export function ProjectStyleReview({ projectStyle }: { projectStyle: ProjectStyleReviewState }) {
  return (
    <Card title="Project style" action={<Badge>project-level</Badge>}>
      {!projectStyle.styleId || !projectStyle.code ? (
        <EmptyState
          title="No project style set"
          hint="Style is chosen at the project level, not per shot."
        />
      ) : (
        <ul className="space-y-1.5 text-sm">
          <li className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="text-ink-lo">
              ◉
            </span>
            <Badge>style</Badge>
            <span className="font-mono text-xs text-ink-hi">{projectStyle.code}</span>
            <span className="text-xs text-ink-mid">{projectStyle.name}</span>
            {projectStyle.resolved && projectStyle.currentVersion ? (
              <EvidenceStatusBadge tone="success">✓ resolved V{projectStyle.currentVersion}</EvidenceStatusBadge>
            ) : (
              <EvidenceStatusBadge tone="blocked">✕ unresolved</EvidenceStatusBadge>
            )}
          </li>
          <li className="text-xs text-ink-lo">
            Applies project-wide — this is not a shot-level pin and cannot be changed from the Visual Control
            section.
          </li>
        </ul>
      )}
    </Card>
  );
}
