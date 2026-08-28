/** Character / Location / Prop / Style bibles, with their pinned version ids. */
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { updateCharacterAction, updateLocationAction, updatePropAction, updateStyleAction } from '@/app/actions';
import { CharacterBibleCard } from '@/components/CharacterBibleForm';
import { LocationBibleCard } from '@/components/LocationBibleForm';
import { PropBibleCard } from '@/components/PropBibleForm';
import { StyleBibleCard } from '@/components/StyleBibleForm';
import { Card, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function BiblesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const [characters, locations, props, styles] = await Promise.all([
    studio.bibles.listCharacters(project.id),
    studio.bibles.listLocations(project.id),
    studio.bibles.listProps(project.id),
    studio.bibles.listStyles(project.id),
  ]);

  return (
    <div className="space-y-5">
      <Card title={`Character Bible (${characters.length})`}>
        {characters.length === 0 ? (
          <EmptyState title="No characters" hint="Parsing a script creates a draft entry for every speaking name." />
        ) : (
          <ul className="space-y-3">
            {characters.map((character) => (
              <CharacterBibleCard
                key={character.id}
                character={character}
                slug={slug}
                updateAction={updateCharacterAction.bind(null, slug)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Location Bible (${locations.length})`}>
        {locations.length === 0 ? (
          <EmptyState title="No locations" />
        ) : (
          <ul className="space-y-3">
            {locations.map((location) => (
              <LocationBibleCard key={location.id} location={location} slug={slug} updateAction={updateLocationAction.bind(null, slug)} />
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Prop Bible (${props.length})`}>
        {props.length === 0 ? (
          <EmptyState title="No props" />
        ) : (
          <ul className="space-y-3">
            {props.map((prop) => (
              <PropBibleCard
                key={prop.id}
                prop={prop}
                characters={characters}
                slug={slug}
                updateAction={updatePropAction.bind(null, slug)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Style Bible (${styles.length})`}>
        {styles.length === 0 ? (
          <EmptyState title="No styles" />
        ) : (
          <ul className="space-y-3">
            {styles.map((style) => (
              <StyleBibleCard
                key={style.id}
                style={style}
                isProjectDefault={project.styleId === style.id}
                slug={slug}
                updateAction={updateStyleAction.bind(null, slug)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
