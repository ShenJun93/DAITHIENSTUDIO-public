import { Notice, StatusBadge } from '@/components/ui';
import { CopyAuditValue } from './CopyAuditValue';
import { TechnicalDisclosure } from './TechnicalDisclosure';

export interface TechnicalPromptAudit {
  kind: 'image' | 'video';
  promptId: string | null;
  version: number | null;
  lockRefs: unknown | null;
}

export interface TechnicalFindingAudit {
  severity: string;
  rule: string;
  message: string;
  field?: string | null;
  expected?: string | null;
  actual?: string | null;
  classification?: string | null;
}

export interface TechnicalAssetLineage {
  id: string;
  name: string;
  lineageHref: string;
}

export interface TechnicalContentProps {
  continuityIn: unknown;
  continuityOut: unknown;
  findings: TechnicalFindingAudit[];
  packageFingerprint: string | null;
  continuityFingerprint: string | null;
  prompts: TechnicalPromptAudit[];
  decisionRule: { code: string; message: string };
  assets: TechnicalAssetLineage[];
}

function AuditValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-lo">{label}</p>
      <div className="mt-1 flex min-w-0 items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1.5 text-xs text-ink-mid">{value}</code>
        <CopyAuditValue value={value} />
      </div>
    </div>
  );
}

export function TechnicalContent(props: TechnicalContentProps) {
  const hasFingerprints = Boolean(props.packageFingerprint || props.continuityFingerprint);

  return (
    <section className="space-y-3" aria-label="Shot technical audit evidence">
      <p className="text-sm text-ink-mid">
        Read-only production evidence for this shot. Sections are collapsed by default; expanding or copying values does not change production state.
      </p>

      <TechnicalDisclosure title="Fingerprints">
        {hasFingerprints ? (
          <div className="space-y-3">
            {props.packageFingerprint && <AuditValue label="Shot package" value={props.packageFingerprint} />}
            {props.continuityFingerprint && <AuditValue label="Continuity" value={props.continuityFingerprint} />}
          </div>
        ) : (
          <Notice tone="info">Fingerprints unavailable.</Notice>
        )}
      </TechnicalDisclosure>

      <TechnicalDisclosure title="Continuity environment">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-ink-lo">Continuity in</h3>
            <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2 text-[11px] text-ink-lo">{JSON.stringify(props.continuityIn, null, 2)}</pre>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-ink-lo">Continuity out</h3>
            <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2 text-[11px] text-ink-lo">{JSON.stringify(props.continuityOut, null, 2)}</pre>
          </div>
        </div>
      </TechnicalDisclosure>

      <TechnicalDisclosure title={`Continuity findings (${props.findings.length})`}>
        {props.findings.length === 0 ? (
          <Notice tone="success">No continuity findings.</Notice>
        ) : (
          <ul className="space-y-2 text-sm">
            {props.findings.map((finding, index) => (
              <li key={`${finding.rule}-${index}`} className="rounded border border-line p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={finding.severity} />
                  <span className="font-mono text-[11px] text-ink-lo">{finding.rule}</span>
                  {finding.classification && <span className="font-mono text-[11px] text-ink-lo">{finding.classification}</span>}
                </div>
                <p className="mt-1 text-ink-mid">{finding.message}</p>
                {finding.field && (
                  <p className="mt-0.5 text-[11px] text-ink-lo">
                    {finding.field}: {finding.expected ?? '—'} → {finding.actual ?? '—'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </TechnicalDisclosure>

      <TechnicalDisclosure title="Prompt provenance">
        <div className="space-y-4">
          {props.prompts.map((prompt) => (
            <div key={prompt.kind} className="rounded border border-line p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-lo">{prompt.kind} prompt</p>
              {prompt.promptId ? (
                <div className="mt-2 space-y-3">
                  <AuditValue label="Prompt id" value={prompt.promptId} />
                  <AuditValue label="Version" value={String(prompt.version ?? '—')} />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-lo">Lock refs</p>
                    <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2 text-[11px] text-ink-lo">{JSON.stringify(prompt.lockRefs ?? {}, null, 2)}</pre>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-lo">No compiled {prompt.kind} prompt.</p>
              )}
            </div>
          ))}
        </div>
      </TechnicalDisclosure>

      <TechnicalDisclosure title="Current decision / blocker rule">
        <div className="space-y-2">
          <AuditValue label="Rule id" value={props.decisionRule.code} />
          <p className="text-sm text-ink-mid">{props.decisionRule.message}</p>
        </div>
      </TechnicalDisclosure>

      <TechnicalDisclosure title={`Asset lineage (${props.assets.length})`}>
        {props.assets.length === 0 ? (
          <Notice tone="info">No asset lineage is available for this shot yet.</Notice>
        ) : (
          <ul className="space-y-2 text-sm">
            {props.assets.map((asset) => (
              <li key={asset.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded border border-line p-2">
                <span className="min-w-0">
                  <span className="block break-words text-ink-hi">{asset.name}</span>
                  <span className="block break-all font-mono text-[11px] text-ink-lo">{asset.id}</span>
                </span>
                <a href={asset.lineageHref} className="text-xs font-medium text-brand hover:underline">Open lineage →</a>
              </li>
            ))}
          </ul>
        )}
      </TechnicalDisclosure>
    </section>
  );
}
