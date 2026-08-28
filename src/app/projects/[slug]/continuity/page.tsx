/** Continuity dashboard — every finding classified and traceable to a field. */
import { getStudio } from '@/infrastructure/container';
import { createContinuityService } from '@/application/services/continuityService';
import { Badge, Card, EmptyState, Notice, Stat, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ContinuityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = await createContinuityService(getStudio()).forProject(slug);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Errors" value={report.errors} hint="block generation" />
        <Stat label="Warnings" value={report.warnings} />
        <Stat label="Notes" value={report.infos} />
        <Stat label="Violations" value={report.byClass['continuity-violation']} hint="identity-critical changes" />
      </div>

      {report.blocked ? (
        <Notice tone="warning">
          {report.errors} blocking error(s). Generation is refused for the affected shots until these are resolved.
        </Notice>
      ) : (
        <Notice tone="success">No blocking continuity errors. Generation is allowed.</Notice>
      )}

      <Card title={`Findings (${report.findings.length})`}>
        {report.findings.length === 0 ? (
          <EmptyState title="Nothing to report" hint="Build shots and compile prompts first — continuity is checked against pinned data." />
        ) : (
          <ul className="space-y-2">
            {report.findings.map((finding, index) => (
              <li key={`${finding.rule}-${index}`} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={finding.severity} />
                  <Badge>{finding.rule}</Badge>
                  <Badge>{finding.classification}</Badge>
                  {finding.sceneCode && <span className="font-mono text-xs text-ink-lo">{finding.sceneCode}</span>}
                </div>
                <p className="mt-1.5 text-sm text-ink-hi">{finding.message}</p>
                {finding.field && (
                  <p className="mt-1 text-xs text-ink-mid">
                    <span className="font-mono">{finding.field}</span>: “{finding.expected}” → “{finding.actual}”
                  </p>
                )}
                {finding.shotCodes.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1 text-xs">
                    {finding.shotCodes.slice(0, 8).map((code) => (
                      <Badge key={`${finding.rule}-${code}`}>{code}</Badge>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
