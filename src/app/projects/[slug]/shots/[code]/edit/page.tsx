/**
 * Shot Editor (TASK-UI-CORE-EDITORS-001). Content-field-only editor calling
 * the accepted scriptService.updateShot through updateShotAction. Routed by
 * shot `code` (not the opaque id) via the existing `studio.shots.byCode`
 * port method, matching the existing Shot Inspector route
 * (`/projects/[slug]/shots/[code]`) it sits beside.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createPromptService } from '@/application/services/promptService';
import { createCreativeWorkspaceService } from '@/application/services/creativeWorkspaceService';
import { updateShotAction } from '@/app/actions';
import { ShotEditForm } from '@/components/ShotEditForm';
import { Badge, Card, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ShotEditPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  if (!project) notFound();

  const shot = await studio.shots.byCode(project.id, decodeURIComponent(code));
  if (!shot) notFound();

  const shotDetailHref = `/projects/${slug}/shots/${encodeURIComponent(shot.code)}`;

  const [scene, characters, locations, props, imagePrompt, videoPrompt, board] = await Promise.all([
    studio.scenes.byId(shot.sceneId),
    studio.bibles.listCharacters(project.id),
    studio.bibles.listLocations(project.id),
    studio.bibles.listProps(project.id),
    createPromptService(studio).latestForShot(shot.id, 'image'),
    createPromptService(studio).latestForShot(shot.id, 'video'),
    createCreativeWorkspaceService(studio).shotStoryboard(project.id, shot.episodeId ?? undefined),
  ]);

  const characterById = new Map(characters.map((character) => [character.id, character]));
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const propById = new Map(props.map((prop) => [prop.id, prop]));
  const summary = board.shots.find((entry) => entry.id === shot.id) ?? null;
  const location = shot.locationId ? locationById.get(shot.locationId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-mono text-lg font-semibold text-ink-hi">{shot.code}</h2>
          <p className="text-sm text-ink-mid">
            {shot.title || '(untitled shot)'} · scene {scene?.code ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={shot.status} />
          <Link href={shotDetailHref} className="text-sm text-brand hover:underline">
            ← Shot {shot.code}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Edit shot" className="lg:col-span-2">
          <ShotEditForm
            slug={slug}
            shot={shot}
            cancelHref={shotDetailHref}
            updateAction={updateShotAction.bind(null, slug, shot.sceneId, shot.id)}
          />
        </Card>

        <div className="space-y-4">
          <Card title="Production context">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Project</dt>
                <dd className="text-ink-hi">{project.title}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Scene</dt>
                <dd className="text-ink-hi">{scene ? `${scene.code} · ${scene.title || '(untitled scene)'}` : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Status</dt>
                <dd>
                  <StatusBadge status={shot.status} />
                  <span className="ml-1.5 text-xs text-ink-lo">system-managed, not editable here</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Last updated</dt>
                <dd className="text-ink-hi">{new Date(shot.updatedAt).toUTCString()}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Readiness</dt>
                {summary && summary.warnings.length > 0 ? (
                  <dd>
                    <ul className="mt-1 space-y-1">
                      {summary.warnings.map((warning) => (
                        <li key={warning} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                          <span aria-hidden="true">⚠</span>
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                ) : (
                  <dd className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <span aria-hidden="true">✓</span>
                    <span>Ready — no warnings</span>
                  </dd>
                )}
              </div>
            </dl>
          </Card>

          <Card title="Pinned bible snapshots (read-only)">
            <div className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Cast</dt>
                {shot.characters.length === 0 ? (
                  <p className="mt-1 text-ink-lo">No characters pinned to this shot.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {shot.characters.map((ref) => (
                      <li key={ref.characterId} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink-hi">{characterById.get(ref.characterId)?.name ?? ref.characterId}</span>
                        <Badge>{ref.versionId || 'UNPINNED'}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Location</dt>
                {shot.locationId ? (
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-ink-hi">{location?.name ?? shot.locationId}</span>
                    <Badge>{shot.locationVersionId || 'UNPINNED'}</Badge>
                  </p>
                ) : (
                  <p className="mt-1 text-ink-lo">No location assigned.</p>
                )}
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Props</dt>
                {shot.props.length === 0 ? (
                  <p className="mt-1 text-ink-lo">No props pinned to this shot.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {shot.props.map((ref) => (
                      <li key={ref.propId} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink-hi">{propById.get(ref.propId)?.name ?? ref.propId}</span>
                        <Badge>{ref.versionId || 'UNPINNED'}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="border-t border-line pt-2 text-xs text-ink-lo">
                Cast, location and prop references pin exact bible snapshot versions and are not editable from this
                editor.
              </p>
            </div>
          </Card>

          <Card title="Prompts and assets (read-only)">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Image prompt</dt>
                <dd className="text-ink-hi">{imagePrompt ? `v${imagePrompt.version.version} compiled` : 'Not compiled yet'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Video prompt</dt>
                <dd className="text-ink-hi">{videoPrompt ? `v${videoPrompt.version.version} compiled` : 'Not compiled yet'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-lo">Generated assets</dt>
                <dd className="text-ink-hi">
                  {summary ? `${summary.assetCoverage.approved} approved of ${summary.assetCoverage.total} total` : '—'}
                </dd>
              </div>
              <p className="border-t border-line pt-2 text-xs text-ink-lo">
                Compile prompts, queue generations and approve assets from the{' '}
                <Link href={shotDetailHref} className="text-brand hover:underline">
                  shot inspector
                </Link>
                .
              </p>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
