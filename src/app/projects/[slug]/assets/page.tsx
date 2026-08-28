/** Asset Library with the lineage trail — the "wow" screen from the spec. */
import { getStudio } from '@/infrastructure/container';
import { createAssetService } from '@/application/services/assetService';
import { createProjectService } from '@/application/services/projectService';
import { checkQualityAction, decideAssetAction, uploadAssetAction } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { AssetUploadForm } from '@/components/AssetUploadForm';
import { Badge, Card, EmptyState, Notice, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ focus?: string; kind?: string }>;
}) {
  const { slug } = await params;
  const { focus, kind } = await searchParams;
  const studio = getStudio();
  const service = createAssetService(studio);
  const project = await createProjectService(studio).get(slug);

  const [assets, shotList] = await Promise.all([
    service.list(slug, { kind, limit: 200 }),
    studio.shots.listByProject(project.id),
  ]);
  const focusId = focus ?? assets[0]?.id ?? null;
  const trail = focusId ? await service.lineageTrail(focusId).catch(() => []) : [];

  return (
    <div className="space-y-5">
      <Card title="Upload asset">
        <AssetUploadForm
          shots={shotList.map((shot) => ({ id: shot.id, code: shot.code }))}
          uploadAction={uploadAssetAction.bind(null, slug)}
        />
      </Card>

      <Card title={`Asset library (${assets.length})`}>
        {assets.length === 0 ? (
          <EmptyState title="No assets yet" hint="Queue a generation or upload reference art above." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {assets.map((asset) => (
              <li
                key={asset.id}
                data-grid-item
                className={`rounded-lg border p-2 ${asset.id === focusId ? 'border-brand' : 'border-line'}`}
              >
                {asset.mimeType.startsWith('image/') ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={studio.storage.url(asset.storageKey)}
                    alt={asset.name}
                    className="h-28 w-full rounded border border-line bg-surface-2 object-contain"
                  />
                ) : asset.mimeType.startsWith('audio/') ? (
                  <audio controls src={studio.storage.url(asset.storageKey)} className="w-full" />
                ) : (
                  <div className="flex h-28 items-center justify-center rounded border border-line bg-surface-2 text-xs text-ink-lo">
                    {asset.mimeType}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <StatusBadge status={asset.approvalState} />
                  <Badge>{asset.kind}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-ink-mid" title={asset.name}>
                  {asset.name}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <a href={`?focus=${asset.id}`} className="text-xs text-brand hover:underline">
                    Lineage
                  </a>
                  <a href={studio.storage.url(asset.storageKey)} className="text-xs text-brand hover:underline">
                    Open file
                  </a>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionButton
                    action={decideAssetAction.bind(null, slug, asset.id, 'approved', 'Approved from the asset library.')}
                    label="Approve"
                    variant="ghost"
                    disabled={asset.approvalState === 'approved'}
                  />
                  <ActionButton action={checkQualityAction.bind(null, slug, asset.id)} label="QC" variant="ghost" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Lineage">
        {trail.length === 0 ? (
          <EmptyState title="Select an asset to trace it" hint="Every artefact records the prompt version and bible snapshots that produced it." />
        ) : (
          <>
            <Notice tone="info">Read top to bottom: output ← what it was derived from.</Notice>
            <ol className="mt-3 space-y-1 font-mono text-xs text-ink-mid">
              {trail.map((line, index) => (
                <li key={`${line}-${index}`} className="whitespace-pre-wrap">
                  {line}
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
    </div>
  );
}
