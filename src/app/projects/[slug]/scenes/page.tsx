/**
 * Scene list — the mutation-capable entry point for the Scene Editor slice
 * (TASK-UI-CORE-EDITORS-001). Deliberately separate from the read-only
 * `/workspace/scenes` Scene Board (out of this slice's scope to touch),
 * mirroring the existing precedent of `/shots` (mutation-capable) staying
 * distinct from `/workspace/shots` (read-only Shot Storyboard).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';
import { Card, DataTable, EmptyState, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ScenesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  if (!project) notFound();

  const activeEpisode = await getActiveEpisode(studio, project.id);
  const scenes = activeEpisode?.id
    ? await studio.scenes.listByEpisode(project.id, activeEpisode.id)
    : await studio.scenes.listByProject(project.id);
  const sorted = [...scenes].sort((a, b) => a.number - b.number);

  return (
    <Card title={`Scenes (${sorted.length})`}>
      {sorted.length === 0 ? (
        <EmptyState title="No scenes yet" hint="Parse a script into scenes from the Script page." />
      ) : (
        <DataTable head={['Code', 'Title', 'Status', 'Duration', '']}>
          {sorted.map((scene) => (
            <tr key={scene.id} className="border-b border-line last:border-0">
              <td className="px-2 py-2 font-mono text-xs text-ink-hi">{scene.code}</td>
              <td className="px-2 py-2 text-ink-hi">{scene.title || '(untitled scene)'}</td>
              <td className="px-2 py-2">
                <StatusBadge status={scene.status} />
              </td>
              <td className="px-2 py-2 text-ink-mid">{scene.durationSeconds}s</td>
              <td className="px-2 py-2 text-right">
                <Link
                  href={`/projects/${slug}/scenes/${encodeURIComponent(scene.code)}/edit`}
                  className="font-medium text-brand hover:underline"
                >
                  Edit →
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  );
}
