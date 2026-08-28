/** Project workspace shell with stable global-to-project context. */
import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { Breadcrumbs, StatusBadge } from '@/components/ui';
import { EpisodeSelector } from '@/components/EpisodeSelector';
import { ProjectModeNavigation } from '@/components/creative-workspace/ProjectModeNavigation';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';

export const dynamic = 'force-dynamic';

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { segment: '', label: 'Overview' },
      { segment: '/workspace/characters', label: 'Characters' },
      { segment: '/workspace/locations', label: 'Locations' },
      { segment: '/workspace/scenes', label: 'Scenes' },
      { segment: '/workspace/shots', label: 'Storyboard' },
    ],
  },
  { label: 'Develop', items: [{ segment: '/story', label: 'Story' }, { segment: '/script', label: 'Script' }, { segment: '/bibles', label: 'Bibles' }] },
  { label: 'Produce', items: [{ segment: '/scenes', label: 'Scenes' }, { segment: '/shots', label: 'Shots' }, { segment: '/assets', label: 'Assets' }, { segment: '/production', label: 'Production' }, { segment: '/voice', label: 'Voice' }, { segment: '/sound', label: 'Sound' }] },
  { label: 'Finish', items: [{ segment: '/continuity', label: 'Continuity' }, { segment: '/advisory', label: 'Advisory' }, { segment: '/queue', label: 'Queue' }, { segment: '/workflow', label: 'Workflow' }, { segment: '/export', label: 'Timeline & Export' }] },
];

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug).catch(() => null);
  if (!project) notFound();
  const episodes = await studio.episodes.listByProject(project.id);
  const activeEpisode = await getActiveEpisode(studio, project.id);

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: 'Studio', href: '/' }, { label: 'Projects', href: '/projects' }, { label: project.title }]} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-hi">{project.title}</h1>
          <p className="text-xs text-ink-lo">
            <span className="font-mono">{project.slug}</span> · {project.format} · {project.productionStrategy} production · {project.aspectRatio} · {project.frameRate}fps · {project.resolution} · {project.language} · ceiling ${project.costLimitUsd.toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeEpisode && <EpisodeSelector projectId={project.id} episodes={episodes} activeEpisodeId={activeEpisode.id} />}
          <StatusBadge status={project.status} />
        </div>
      </header>
      <nav aria-label="Project workspace" className="space-y-2 overflow-x-auto border-y border-line py-2 whitespace-nowrap">
        <ProjectModeNavigation slug={slug} groups={NAV_GROUPS} />
      </nav>
      {children}
    </div>
  );
}
