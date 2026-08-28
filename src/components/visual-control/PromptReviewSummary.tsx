/**
 * VC2 — Prompt version review summary (TASK-UI-VISUAL-CONTROL-001).
 * Shows the exact compiled prompt version recorded for this shot (image and
 * video), its lint state and the compiled text, so the operator can see the
 * exact versions that produced the shot package.
 */
import type { PromptReviewState } from '@/domain/visualControl/types';
import { Badge, Card } from '@/components/ui';
import { EvidenceStatusBadge } from './EvidenceStatusBadge';

export function PromptReviewSummary({
  prompt,
}: {
  prompt: { image: PromptReviewState; video: PromptReviewState };
}) {
  return (
    <Card title="Prompt versions">
      <div className="space-y-3">
        {(['image', 'video'] as const).map((kind) => {
          const p = prompt[kind];
          const compiled = p.promptId ? p.compiled : null;
          return (
            <div key={kind}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink-hi capitalize">{kind} prompt</span>
                {p.promptId ? (
                  <>
                    <Badge>{`v${p.version}`}</Badge>
                    <EvidenceStatusBadge tone={p.lintOk ? 'success' : 'warning'}>
                      {p.lintOk ? '✓ lint ok' : '⚠ lint issues'}
                    </EvidenceStatusBadge>
                    <span className="font-mono text-xs text-ink-lo">{p.promptId}</span>
                  </>
                ) : (
                  <EvidenceStatusBadge tone="neutral">○ not compiled</EvidenceStatusBadge>
                )}
              </div>
              {compiled && (
                <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface-0 p-2 font-mono text-[11px] leading-relaxed text-ink-mid">
                  {compiled}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
