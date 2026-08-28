import Link from 'next/link';
import type { CreativeWorkspaceOverview, WorkspaceStageState } from '@/application/services/creativeWorkspaceService';
import { Badge, Card, EmptyState, StatusBadge } from '@/components/ui';

const STAGE_STYLE: Record<WorkspaceStageState, string> = {
  complete: 'border-emerald-500/60 bg-emerald-500/10',
  'in-progress': 'border-brand/60 bg-brand/10',
  attention: 'border-amber-500/60 bg-amber-500/10',
  'not-started': 'border-line bg-surface-2',
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function WorkspaceOverview({ workspace }: { workspace: CreativeWorkspaceOverview }) {
  const { project } = workspace;
  return (
    <div className="space-y-5">
      <section aria-labelledby="workspace-overview-title" className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="border-b border-line bg-surface-2 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-lo">Project overview</p>
              <h2 id="workspace-overview-title" className="mt-1 text-2xl font-semibold text-ink-hi">{project.title}</h2>
              {project.description && <p className="mt-1 max-w-3xl text-sm text-ink-mid">{project.description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{workspace.productionType}</Badge>
              <Badge>{workspace.productionStrategy} production</Badge>
              <StatusBadge status={project.status} />
            </div>
          </div>
        </div>
        <dl className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Scenes', workspace.counts.scenes], ['Shots', workspace.counts.shots],
            ['Bible entries', workspace.counts.bibles], ['Approved assets', workspace.counts.approvedAssets],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface-1 px-5 py-4">
              <dt className="text-xs uppercase tracking-wide text-ink-lo">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink-hi">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {!workspace.hasProductionData && (
        <EmptyState title="This project has no production data yet" hint="The workspace will reflect persisted Bibles, scripts, scenes, shots and media as they become available." action={<Link href={`/projects/${project.slug}/story`} className="text-sm font-medium text-brand hover:underline">Open story workspace</Link>} />
      )}

      <Card title="Project journey" action={<span className="text-xs text-ink-lo">Persisted progress</span>}>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Project production journey">
          {workspace.journey.map((item, index) => (
            <li key={item.key}>
              <Link href={item.href} className={`block min-h-24 rounded-lg border p-3 transition hover:border-brand ${STAGE_STYLE[item.state]}`}>
                <span className="flex items-center justify-between gap-2"><span className="text-xs tabular-nums text-ink-lo">{String(index + 1).padStart(2, '0')}</span><span className="text-[11px] text-ink-mid">{item.state}</span></span>
                <strong className="mt-3 block text-sm text-ink-hi">{item.label}</strong>
                <span className="mt-0.5 block text-xs text-ink-mid">{item.detail}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
        <Card title="Readiness" action={<StatusBadge status={workspace.readiness.readyForCompose ? 'completed' : 'review'} />}>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div><dt className="text-xs text-ink-lo">Storyboard</dt><dd className="mt-1 text-sm font-medium text-ink-hi">{workspace.readiness.readyForStoryboard ? 'Ready' : 'Needs references'}</dd></div>
            <div><dt className="text-xs text-ink-lo">Production sources</dt><dd className="mt-1 text-sm font-medium text-ink-hi">{workspace.readiness.readyShots} / {workspace.readiness.totalShots} shots</dd></div>
            <div><dt className="text-xs text-ink-lo">Compose</dt><dd className="mt-1 text-sm font-medium text-ink-hi">{workspace.readiness.readyForCompose ? 'Ready' : 'Not ready'}</dd></div>
          </dl>
        </Card>
        <Card title="Warnings" action={<Badge>{workspace.warnings.length}</Badge>}>
          {workspace.warnings.length === 0 ? <p className="text-sm text-ink-mid">No readiness warnings from current records.</p> : (
            <ul className="space-y-2">
              {workspace.warnings.slice(0, 4).map((warning) => (
                <li key={warning.key} className="border-l-2 border-amber-500 pl-3"><Link href={warning.href} className="text-sm font-medium text-ink-hi hover:text-brand hover:underline">{warning.label}</Link><p className="text-xs text-ink-mid">{warning.detail}</p></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Output profile">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs uppercase tracking-wide text-ink-lo">Platform</dt><dd className="mt-1 text-sm text-ink-hi">{project.platform}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-lo">Canvas</dt><dd className="mt-1 text-sm text-ink-hi">{project.aspectRatio} · {project.resolution}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-lo">Frame rate</dt><dd className="mt-1 text-sm text-ink-hi">{project.frameRate} fps</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-lo">Target duration</dt><dd className="mt-1 text-sm text-ink-hi">{formatDuration(project.durationTargetSeconds)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-lo">Language</dt><dd className="mt-1 text-sm text-ink-hi">{project.language}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-lo">Audience</dt><dd className="mt-1 text-sm text-ink-hi">{project.targetAudience}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-lo">Genre</dt><dd className="mt-1 text-sm text-ink-hi">{project.genre}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-lo">Secondary canvases</dt><dd className="mt-1 text-sm text-ink-hi">{project.secondaryAspectRatios.length ? project.secondaryAspectRatios.join(', ') : 'None recorded'}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
