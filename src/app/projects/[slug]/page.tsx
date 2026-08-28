import Link from 'next/link';
import { getStudio } from '@/infrastructure/container';
import { createCreativeWorkspaceService } from '@/application/services/creativeWorkspaceService';
import { createProductionJourneyService } from '@/application/services/productionJourneyService';
import { createWorkflowService } from '@/application/services/workflowService';
import { WorkspaceOverview } from '@/components/creative-workspace/WorkspaceOverview';
import { ProductionJourneyHome } from '@/components/creative-workspace/ProductionJourneyHome';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';
import { buildPromptsAction, changeProjectProductionTypeAction, runWorkflowAction } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { CreateEpisodeForm } from '@/components/CreateEpisodeForm';
import { EpisodeList } from '@/components/EpisodeList';
import { ProjectProductionTypeControl } from '@/components/ProjectProductionTypeControl';
import { Card, EmptyState, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ProjectOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  const activeEpisode = project ? await getActiveEpisode(studio, project.id) : null;
  const workspace = await createCreativeWorkspaceService(studio).overview(slug, activeEpisode?.id);
  const journey = await createProductionJourneyService(studio).overview(slug, activeEpisode?.id);
  const episodes = await studio.episodes.listByProject(workspace.project.id);
  const runs = await createWorkflowService(studio).list(slug);
  const issueCount = journey.blockers.length + journey.warnings.length;

  return (
    <div className="space-y-6">
      <section aria-labelledby="project-attention-title" className="rounded-xl border border-line bg-surface-1 p-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-lo">Project attention</p>
        <h2 id="project-attention-title" className="mt-1 text-lg font-semibold text-ink-hi">
          {journey.primaryAction?.label ?? "You're all caught up"}
        </h2>
        <p className="mt-1 text-sm text-ink-mid">
          {journey.primaryAction?.reason ?? 'No further production action is recommended right now.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-medium text-ink-hi">
            {journey.blockers.length} blocker{journey.blockers.length === 1 ? '' : 's'} · {journey.warnings.length} warning{journey.warnings.length === 1 ? '' : 's'}
          </span>
          {journey.primaryAction?.targetRoute && (
            <Link href={journey.primaryAction.targetRoute} className="font-medium text-brand hover:underline">
              Continue safely →
            </Link>
          )}
          {issueCount === 0 && <span className="text-ink-lo">No open journey issues.</span>}
        </div>
      </section>

      <ProjectProductionTypeControl 
        slug={slug} 
        currentType={workspace.project.productionType ?? null} 
        changeAction={changeProjectProductionTypeAction} 
      />

      <ProductionJourneyHome journey={journey} />
      <WorkspaceOverview workspace={workspace} />

      <Card title="Actions">
        <div className="flex flex-wrap gap-4">
          <ActionButton action={buildPromptsAction.bind(null, slug, 'image')} label="Compile image prompts" pendingLabel="Compiling…" variant="ghost" />
          <ActionButton action={buildPromptsAction.bind(null, slug, 'video')} label="Compile video prompts" pendingLabel="Compiling…" variant="ghost" />
          <ActionButton action={runWorkflowAction.bind(null, slug, 'motion-comic')} label="Run motion-comic workflow" pendingLabel="Running…" variant="ghost" />
        </div>
        <p className="mt-3 text-xs text-ink-lo">Every action is idempotent: existing scenes, shots and prompts are never silently replaced.</p>
      </Card>

      <Card title="Workflow runs">
        {runs.length === 0 ? <EmptyState title="No workflow has been run yet" /> : (
          <ul className="space-y-3">{runs.slice(0, 4).map((run) => <li key={run.id} className="rounded-md border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-ink-hi">{run.workflowKey}</span><StatusBadge status={run.status} /></div><ol className="mt-2 space-y-1 text-xs">{run.steps.map((step) => <li key={step.key} className="flex flex-wrap items-baseline gap-2"><StatusBadge status={step.status === 'awaiting-approval' ? 'review' : step.status} /><span className="text-ink-hi">{step.label}</span>{step.detail && <span className="text-ink-lo">— {step.detail}</span>}</li>)}</ol></li>)}</ul>
        )}
      </Card>

      <Card title="Episodes">
        <div className="flex flex-col gap-3">
          <EpisodeList slug={workspace.project.slug} episodes={episodes} activeEpisodeId={workspace.activeEpisodeId} />
          <CreateEpisodeForm slug={workspace.project.slug} />
        </div>
      </Card>
    </div>
  );
}
