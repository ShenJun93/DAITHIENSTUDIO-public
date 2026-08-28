/** Dashboard — operator attention and project resume entrypoint. */
import Link from 'next/link';
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { Button, Card, EmptyState, Stat, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const studio = getStudio();
  const service = createProjectService(studio);
  const [summary, projects] = await Promise.all([service.dashboard(), service.list({ limit: 8 })]);

  const waiting = summary.shotsByStatus.planned ?? 0;
  const failed = summary.generationsByStatus.failed ?? 0;
  const queued = (summary.generationsByStatus.pending ?? 0) + (summary.generationsByStatus.processing ?? 0);
  const attentionCount = failed + summary.pendingAssets + waiting;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-lo">Studio attention</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-hi">What needs attention now?</h1>
          <p className="mt-1 text-sm text-ink-mid">Resume production from current persisted state instead of hunting through modules.</p>
        </div>
        <Link href="/projects"><Button variant="ghost">All projects</Button></Link>
      </header>

      <section aria-labelledby="attention-title" className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-5 py-4">
          <div><h2 id="attention-title" className="text-sm font-semibold text-ink-hi">Attention queue</h2><p className="mt-0.5 text-xs text-ink-mid">Only persisted production states are shown here.</p></div>
          <span className="text-xs tabular-nums text-ink-lo">{attentionCount} item{attentionCount === 1 ? '' : 's'}</span>
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-3">
          <div className="bg-surface-1 px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-lo">Failed generations</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-hi">{failed}</p><p className="mt-1 text-xs text-ink-mid">Jobs that need operator investigation.</p></div>
          <div className="bg-surface-1 px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-lo">Awaiting review</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-hi">{summary.pendingAssets}</p><p className="mt-1 text-xs text-ink-mid">Assets waiting for an approval decision.</p></div>
          <div className="bg-surface-1 px-5 py-4"><p className="text-xs uppercase tracking-wide text-ink-lo">Shots waiting</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-hi">{waiting}</p><p className="mt-1 text-xs text-ink-mid">Planned shots not yet advanced.</p></div>
        </div>
      </section>

      <Card title="Resume a project" action={<Link href="/projects" className="text-xs font-medium text-brand hover:underline">Browse all →</Link>}>
        {projects.length === 0 ? <EmptyState title="No projects yet" hint="Create a project to start the production journey." action={<Link href="/projects"><Button>Create a project</Button></Link>} /> : (
          <ul className="divide-y divide-line">{projects.map((project) => <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><Link href={`/projects/${project.slug}`} className="text-sm font-medium text-ink-hi hover:text-brand hover:underline">{project.title}</Link><p className="mt-0.5 truncate text-xs text-ink-lo">{project.format} · {project.aspectRatio} · {project.language} · {project.platform}</p></div><div className="flex items-center gap-3"><StatusBadge status={project.status} /><Link href={`/projects/${project.slug}`} className="text-xs font-medium text-brand hover:underline">Resume →</Link></div></li>)}</ul>
        )}
      </Card>

      <section aria-labelledby="studio-state-title" className="space-y-3"><div><h2 id="studio-state-title" className="text-sm font-semibold text-ink-hi">Studio state</h2><p className="text-xs text-ink-mid">Secondary operational context after attention and resume actions.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Active projects" value={summary.activeProjects} hint={`${summary.projects} total`} /><Stat label="In the queue" value={queued} hint={`${failed} failed job(s)`} /><Stat label="Approved assets" value={summary.approvedAssets} hint={`${summary.pendingAssets} awaiting review`} /><Stat label="Spend so far" value={`$${summary.estimatedSpendUsd.toFixed(4)}`} hint="actual provider cost recorded" /></div></section>

      <div className="grid gap-4 lg:grid-cols-2"><Card title="Shot status">{Object.keys(summary.shotsByStatus).length === 0 ? <EmptyState title="No shots yet" hint="Create a project, paste a script, and build the shot list." /> : <ul className="space-y-1.5">{Object.entries(summary.shotsByStatus).sort((a,b)=>b[1]-a[1]).map(([status,total])=><li key={status} className="flex items-center justify-between text-sm"><StatusBadge status={status} /><span className="tabular-nums text-ink-mid">{total}</span></li>)}</ul>}</Card><Card title="Recent activity">{summary.recentActivity.length === 0 ? <EmptyState title="Nothing has happened yet" /> : <ul className="space-y-1 font-mono text-xs text-ink-mid">{summary.recentActivity.map((entry,index)=><li key={`${entry.createdAt}-${index}`} className="flex flex-wrap gap-2"><span className="text-ink-lo">{new Date(entry.createdAt).toLocaleTimeString()}</span><span className="text-ink-hi">{entry.action}</span><span className="text-ink-lo">{entry.targetType}/{entry.targetId.slice(0,12)}</span></li>)}</ul>}</Card></div>
    </div>
  );
}
