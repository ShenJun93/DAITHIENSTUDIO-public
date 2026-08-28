/**
 * VC2 — Evidence status badge (TASK-UI-VISUAL-CONTROL-001).
 *
 * Status is never communicated by colour alone (docs/design/DESIGN.md rule 04):
 * every badge carries a glyph and a word. Tones map to the semantic status
 * tokens in src/app/globals.css (success / warning / blocked / info / neutral).
 */
import type { ReactNode } from 'react';

export type EvidenceBadgeTone = 'success' | 'warning' | 'blocked' | 'info' | 'neutral';

const TONE_STYLE: Record<EvidenceBadgeTone, string> = {
  success: 'border-success bg-success-soft text-success',
  warning: 'border-warning bg-warning-soft text-warning',
  blocked: 'border-blocked bg-blocked-soft text-blocked',
  info: 'border-info bg-info-soft text-info',
  neutral: 'border-line bg-surface-2 text-ink-mid',
};

export function EvidenceStatusBadge({
  tone,
  children,
  title,
}: {
  tone: EvidenceBadgeTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${TONE_STYLE[tone]}`}
    >
      {children}
    </span>
  );
}
