import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createCreativeWorkspaceService } from '@/application/services/creativeWorkspaceService';
import { getActiveEpisode } from '@/app/_lib/activeEpisode';
import { EntityBrowserView } from '@/components/creative-workspace/EntityBrowserView';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function LocationBrowserPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  if (!project) notFound();
  const activeEpisode = await getActiveEpisode(studio, project.id);
  const browser = await createCreativeWorkspaceService(studio).locationBrowser(slug, activeEpisode?.id);

  return (
    <Card
      title={`Locations (${browser.entries.length})`}
      action={
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-lo">Read-only browser · persisted Location Bible</span>
          <Link
            href={`/projects/${slug}/workspace/locations/new`}
            className="text-xs font-medium text-brand hover:underline"
          >
            New Location
          </Link>
        </div>
      }
    >
      <EntityBrowserView
        entries={browser.entries}
        emptyTitle="No locations yet"
        emptyHint="Parsing a script creates a draft entry for every named location, or create one manually."
      />
    </Card>
  );
}
