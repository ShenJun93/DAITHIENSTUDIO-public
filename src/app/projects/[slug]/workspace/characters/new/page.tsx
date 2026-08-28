import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createCharacterAction } from '@/app/actions';
import { CharacterCreateForm } from '@/components/CharacterCreateForm';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CharacterCreatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  if (!project) notFound();

  return (
    <Card
      title="New character"
      action={
        <Link href={`/projects/${slug}/workspace/characters`} className="text-xs font-medium text-brand hover:underline">
          ← Character Browser
        </Link>
      }
      className="mx-auto max-w-2xl"
    >
      <CharacterCreateForm slug={slug} createAction={createCharacterAction.bind(null, slug)} />
    </Card>
  );
}
