import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createLocationAction } from '@/app/actions';
import { LocationCreateForm } from '@/components/LocationCreateForm';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function LocationCreatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  if (!project) notFound();

  return (
    <Card
      title="New location"
      action={
        <Link href={`/projects/${slug}/workspace/locations`} className="text-xs font-medium text-brand hover:underline">
          ← Location Browser
        </Link>
      }
      className="mx-auto max-w-2xl"
    >
      <LocationCreateForm slug={slug} createAction={createLocationAction.bind(null, slug)} />
    </Card>
  );
}
