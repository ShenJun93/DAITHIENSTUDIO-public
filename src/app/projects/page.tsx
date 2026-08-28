/** Project list + create form. */
import Link from 'next/link';
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createProjectAction } from '@/app/actions';
import { STYLE_PRESETS } from '@/domain/styles/presets';
import { Breadcrumbs, Card, DataTable, EmptyState, StatusBadge } from '@/components/ui';
import { ProjectForm } from '@/components/ProjectForm';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await createProjectService(getStudio()).list({ limit: 100 });

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Studio', href: '/' }, { label: 'Projects' }]} />
      <h1 className="text-xl font-semibold text-ink-hi">Projects</h1>

      <Card title={`${projects.length} project(s)`}>
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" hint="Create one below, or run npm run db:seed for the demo." />
        ) : (
          <DataTable head={['Title', 'Slug', 'Format', 'Ratio', 'Status', '']}>
            {projects.map((project) => (
              <tr key={project.id} className="border-b border-line/60">
                <td className="px-2 py-2 text-ink-hi">{project.title}</td>
                <td className="px-2 py-2 font-mono text-xs text-ink-lo">{project.slug}</td>
                <td className="px-2 py-2 text-ink-mid">{project.format}</td>
                <td className="px-2 py-2 text-ink-mid">{project.aspectRatio}</td>
                <td className="px-2 py-2">
                  <StatusBadge status={project.status} />
                </td>
                <td className="px-2 py-2 text-right">
                  <Link href={`/projects/${project.slug}`} className="text-sm text-brand hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="New project">
        <ProjectForm
          action={createProjectAction}
          presets={STYLE_PRESETS.map((preset) => ({ key: preset.key, name: preset.name }))}
        />
      </Card>
    </div>
  );
}
