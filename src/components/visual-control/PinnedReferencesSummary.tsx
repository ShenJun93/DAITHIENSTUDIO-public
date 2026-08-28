/**
 * VC2/VC3/VC7 — Pinned references summary (TASK-UI-VISUAL-CONTROL-001).
 *
 * VC2: shows the pinned bible snapshot versions recorded for the shot and
 * whether each pin still resolves to an existing snapshot.
 *
 * VC3 (additive): for each shot-field Character/Location/Prop pin, an explicit
 * operator repin control is rendered below the pin when `repin` data is
 * supplied. Style pins (prompt-lockref) stay read-only. When an approved
 * snapshot exists for a reference (`approvedReferences`), the approved
 * snapshot id and its approved asset count are shown, so the operator can
 * check the approved snapshot for each reference (acceptance scenario S3).
 *
 * VC7 (additive): exposes the already-derived approved-reference binding role
 * beside that approval evidence. This is read-only evidence; no binding or
 * approval mutation authority is introduced here.
 */
import type { ApprovedReferenceState, PinnedReferenceState } from '@/domain/visualControl/types';
import { Badge, Card, EmptyState } from '@/components/ui';
import { EvidenceStatusBadge } from './EvidenceStatusBadge';
import { ReferenceRepinControl } from './ReferenceRepinControl';
import type { RepinData } from './visualControlRepin';

const KIND_GLYPH: Record<PinnedReferenceState['kind'], string> = {
  character: '◆',
  location: '◈',
  prop: '◇',
  style: '◉',
};

export function PinnedReferencesSummary({
  pins,
  approvedReferences = [],
  repin,
}: {
  pins: PinnedReferenceState[];
  approvedReferences?: ApprovedReferenceState[];
  repin?: RepinData;
}) {
  const approvedByRef = new Map(approvedReferences.map((ref) => [`${ref.kind}:${ref.refId}`, ref]));

  return (
    <Card
      title="Pinned references"
      action={<span className="font-mono text-xs text-ink-lo">{pins.length} pin{pins.length === 1 ? '' : 's'}</span>}
    >
      {pins.length === 0 ? (
        <EmptyState
          title="No pinned references"
          hint="Pin bible snapshots to this shot to build the visual package."
        />
      ) : (
        <ul className="space-y-2 text-sm">
          {pins.map((pin) => {
            const key = `${pin.kind}:${pin.refId}`;
            const approved = approvedByRef.get(key);
            const versions = repin ? (repin.versionsByRef[key] ?? []) : [];
            const name = repin ? (repin.names[key] ?? pin.code) : pin.code;
            const canRepin = Boolean(repin) && pin.source === 'shot-field';
            return (
              <li key={key} className="rounded border border-line/60 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true" className="text-ink-lo">
                    {KIND_GLYPH[pin.kind]}
                  </span>
                  <Badge>{pin.kind}</Badge>
                  <span className="font-mono text-xs text-ink-hi">{pin.code || pin.refId}</span>
                  {name !== pin.code && <span className="text-xs text-ink-mid">{name}</span>}
                  <span className="font-mono text-xs text-ink-lo">{pin.versionId ?? 'UNPINNED'}</span>
                  {pin.source === 'prompt-lockref' && (
                    <Badge>
                      <span className="font-mono text-[10px]">prompt-lockref</span>
                    </Badge>
                  )}
                  {pin.resolved ? (
                    <span className="text-xs text-ink-lo">snapshot exists</span>
                  ) : (
                    <EvidenceStatusBadge tone="blocked" title={pin.resolvableReason ?? undefined}>
                      ✕ unresolved
                    </EvidenceStatusBadge>
                  )}
                </div>
                {approved && (
                  <div className="mt-1 text-xs text-ink-mid">
                    <span aria-hidden="true">✓ </span>
                    approved snapshot{' '}
                    <span className="font-mono text-ink-hi">{approved.versionId}</span>
                    {' · '}
                    {approved.approvedAssetIds.length} approved asset
                    {approved.approvedAssetIds.length === 1 ? '' : 's'}
                    {' · role '}
                    <span className="font-mono text-ink-hi">{approved.role}</span>
                  </div>
                )}
                {canRepin && (
                  <ReferenceRepinControl
                    kind={pin.kind as 'character' | 'location' | 'prop'}
                    refId={pin.refId}
                    code={pin.code}
                    name={name}
                    currentVersionId={pin.versionId}
                    resolved={pin.resolved}
                    resolvableReason={pin.resolvableReason}
                    versions={versions}
                    action={repin!.action}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
