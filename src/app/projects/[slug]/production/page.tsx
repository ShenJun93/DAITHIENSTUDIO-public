import Link from 'next/link';
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createProductionStrategyService } from '@/application/services/productionStrategyService';
import { setProductionStrategyAction, uploadAssetAction } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { AssetUploadForm } from '@/components/AssetUploadForm';
import { Badge, Card, EmptyState, Notice, StatusBadge } from '@/components/ui';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';

export const dynamic = 'force-dynamic';

export default async function ProductionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const projectService = createProjectService(studio);
  const production = createProductionStrategyService(studio);
  const project = await projectService.get(slug);
  const [overview, readiness, bindings] = await Promise.all([
    projectService.overview(slug),
    production.readiness(slug),
    production.listBindings(slug),
  ]);

  const bindingTargets = [
    ...overview.characters.map((item) => ({
      value: `character|${item.id}|${formatSnapshotId(item.code, item.currentVersion)}|identity-anchor`,
      label: `Character · ${item.name} · ${formatSnapshotId(item.code, item.currentVersion)}`,
    })),
    ...overview.locations.map((item) => ({
      value: `location|${item.id}|${formatSnapshotId(item.code, item.currentVersion)}|environment-anchor`,
      label: `Location · ${item.name} · ${formatSnapshotId(item.code, item.currentVersion)}`,
    })),
    ...overview.props.map((item) => ({
      value: `prop|${item.id}|${formatSnapshotId(item.code, item.currentVersion)}|prop-anchor`,
      label: `Prop · ${item.name} · ${formatSnapshotId(item.code, item.currentVersion)}`,
    })),
    ...overview.styles.map((item) => ({
      value: `style|${item.id}|${formatSnapshotId(item.code, item.currentVersion)}|style-anchor`,
      label: `Style · ${item.name} · ${formatSnapshotId(item.code, item.currentVersion)}`,
    })),
    ...overview.shots.map((item) => ({
      value: `shot|${item.id}||storyboard-keyframe`,
      label: `Storyboard · ${item.code}`,
    })),
  ];

  return (
    <div className="space-y-5">
      <Card title="Acquisition strategy">
        <div className="grid gap-3 md:grid-cols-2">
          <section className={`rounded-lg border p-4 ${project.productionStrategy === 'hybrid' ? 'border-brand bg-surface-2' : 'border-line'}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink-hi">Hybrid · controlled imports</h3>
              {project.productionStrategy === 'hybrid' && <StatusBadge status="approved" />}
            </div>
            <p className="mt-2 text-sm text-ink-mid">Upload character, location, prop, style and storyboard media from any tool. Every file is pinned to an exact version and must be approved.</p>
            <div className="mt-3">
              <ActionButton
                action={setProductionStrategyAction.bind(null, slug, 'hybrid')}
                label={project.productionStrategy === 'hybrid' ? 'Hybrid selected' : 'Use Hybrid'}
                disabled={project.productionStrategy === 'hybrid'}
              />
            </div>
          </section>
          <section className={`rounded-lg border p-4 ${project.productionStrategy === 'auto' ? 'border-brand bg-surface-2' : 'border-line'}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink-hi">Auto A–Z · providers</h3>
              {project.productionStrategy === 'auto' && <StatusBadge status="approved" />}
            </div>
            <p className="mt-2 text-sm text-ink-mid">Provider-generated media only. Manual imports never become a silent fallback. API calls remain operator-controlled.</p>
            <div className="mt-3">
              <ActionButton
                action={setProductionStrategyAction.bind(null, slug, 'auto')}
                label={project.productionStrategy === 'auto' ? 'Auto selected' : 'Use Auto'}
                disabled={project.productionStrategy === 'auto'}
              />
            </div>
          </section>
        </div>
      </Card>

      <Card title="Consistency gate">
        {readiness.anchors.length === 0 ? (
          <EmptyState title="No pinned shot references yet" hint="Parse the script and build shots first; their exact Bible versions will appear here." />
        ) : (
          <div className="space-y-4">
            <Notice tone={readiness.readyForStoryboard ? 'success' : 'warning'}>
              {readiness.readyForStoryboard
                ? 'Every required Bible snapshot has an approved visual anchor.'
                : `${readiness.missingAnchorSnapshotIds.length} approved Bible anchor(s) are still missing. Storyboard production remains gated.`}
            </Notice>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {readiness.anchors.map((anchor) => (
                <li key={anchor.snapshotId} className="rounded border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge>{anchor.snapshotId}</Badge>
                    <StatusBadge status={anchor.approvedAssetIds.length > 0 ? 'approved' : 'pending'} />
                  </div>
                  <p className="mt-1 text-xs text-ink-mid">{anchor.targetType} · {anchor.approvedAssetIds.length} approved anchor(s)</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Upload and pin a production reference">
        {bindingTargets.length === 0 ? (
          <EmptyState title="Nothing to bind yet" hint="Create Bible entries or shots first." />
        ) : (
          <>
            <Notice tone="info">Upload creates a pending asset. Review and approve it in Assets before the consistency gate can pass.</Notice>
            <div className="mt-3">
              <AssetUploadForm
                shots={overview.shots.map((shot) => ({ id: shot.id, code: shot.code }))}
                bindingTargets={bindingTargets}
                uploadAction={uploadAssetAction.bind(null, slug)}
              />
            </div>
            <Link href={`/projects/${slug}/assets`} className="mt-3 inline-block text-sm text-brand hover:underline">Review and approve uploaded assets →</Link>
          </>
        )}
      </Card>

      <Card title={`Storyboard coverage (${readiness.shots.filter((shot) => shot.ready).length}/${readiness.shots.length})`}>
        {readiness.shots.length === 0 ? (
          <EmptyState title="No shots yet" hint="Build shots from the script to plan storyboard coverage." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {readiness.shots.map((shot) => (
              <li key={shot.shotId} className="rounded border border-line p-3">
                <div className="flex items-center justify-between gap-2"><Badge>{shot.shotCode}</Badge><StatusBadge status={shot.ready ? 'approved' : 'pending'} /></div>
                <p className="mt-1 text-xs text-ink-mid">Source: {shot.source}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-lo">{bindings.length} immutable reference binding(s) persisted for this project.</p>
      </Card>

      <Card title="Binding provenance and lineage">
        {bindings.length === 0 ? (
          <EmptyState title="No immutable bindings yet" hint="Upload and pin a source to record its exact production target." />
        ) : (
          <ul className="space-y-2">
            {bindings.map((binding) => (
              <li key={binding.id} className="rounded border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{binding.role}</Badge>
                  <span className="font-mono text-xs text-ink-hi">asset:{binding.assetId}</span>
                  <span aria-hidden="true" className="text-ink-lo">→</span>
                  <span className="font-mono text-xs text-ink-hi">
                    {binding.targetType}:{binding.targetVersionId || binding.targetId}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-mid">
                  Target ID {binding.targetId}; bound {binding.createdAt}. This lineage record is append-only.
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
