/**
 * Scene Editor (TASK-UI-CORE-EDITORS-001). Content-field-only editor calling
 * the accepted scriptService.updateScene through updateSceneAction. Routed
 * by scene `code` (not the opaque id), matching the existing Shot detail
 * route (`/projects/[slug]/shots/[code]`) — SceneRepository has no `byCode`
 * method, so the code is matched against the project's already-loaded scene
 * list (no new port method, no new persistence).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createCreativeWorkspaceService } from '@/application/services/creativeWorkspaceService';
import { updateSceneAction } from '@/app/actions';
import { SceneEditForm } from '@/components/SceneEditForm';
import { Card, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SceneEditPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const studio = getStudio();
  const project = await studio.projects.bySlug(slug);
  if (!project) notFound();

  const scenes = await studio.scenes.listByProject(project.id);
  const scene = scenes.find((candidate) => candidate.code === decodeURIComponent(code));
  if (!scene) notFound();

  const [episode, locations, board] = await Promise.all([
    scene.episodeId ? studio.episodes.findById(scene.episodeId) : Promise.resolve(null),
    studio.bibles.listLocations(project.id),
    createCreativeWorkspaceService(studio).sceneBoard(project.id, scene.episodeId ?? undefined),
  ]);
  const summary = board.scenes.find((entry) => entry.id === scene.id) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-mono text-lg font-semibold text-ink-hi">{scene.code}</h2>
          <p className="text-sm text-ink-mid">
            {scene.title || '(untitled scene)'} · scene {scene.number}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={scene.status} />
          <Link href={`/projects/${slug}/scenes`} className="text-sm text-brand hover:underline">
            ← Scene list
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Edit scene" className="lg:col-span-2">
          <SceneEditForm
            slug={slug}
            scene={scene}
            locations={locations.map((location) => ({ id: location.id, name: location.name }))}
            updateAction={updateSceneAction.bind(null, slug, scene.id, scene.episodeId ?? undefined)}
          />
        </Card>

        <Card title="Context">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-lo">Project</dt>
              <dd className="text-ink-hi">{project.title}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-lo">Episode</dt>
              <dd className="text-ink-hi">{episode ? `${episode.code} · ${episode.title}` : 'Not assigned'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-lo">Linked shots</dt>
              <dd className="text-ink-hi">{summary?.shotCount ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-lo">Characters in scene</dt>
              <dd className="text-ink-hi">{summary?.characterCount ?? scene.characters.length}</dd>
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
      </div>
    </div>
  );
}
