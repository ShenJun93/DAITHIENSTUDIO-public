import Link from 'next/link';
import type { APPROVAL_STATES, GenerationStatus } from '@/domain/enums';
import type { PrepareImageGenerationInput, PrepareVideoGenerationInput } from '@/domain/schemas';
import { Badge, Card, EmptyState, StatusBadge } from '@/components/ui';
import {
  cancelPendingGenerationAction,
  confirmImageGenerationAction,
  confirmVideoGenerationAction,
  prepareImageGenerationAction,
  prepareVideoGenerationAction,
  retryFailedGenerationAction,
} from '@/app/generationActions';
import { ShotCostSummary } from './ShotCostSummary';
import { AssetCompareReview, type AssetCompareCandidate } from './AssetCompareReview';
import { GenerationJobControls } from './GenerationJobControls';
import { ImageGenerationConfirmation } from './ImageGenerationConfirmation';
import { VideoGenerationConfirmation } from './VideoGenerationConfirmation';

export interface GenerationRecord {
  id: string;
  status: GenerationStatus;
  kind: string;
  provider: string;
  model: string;
  estimatedCostUsd: number;
  actualCostUsd: number;
  attempts: number;
  maxAttempts: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface AssetRecord extends AssetCompareCandidate {
  approvalState: (typeof APPROVAL_STATES)[number];
}

export interface GenerationsContentProps {
  generations: GenerationRecord[];
  assets: AssetRecord[];
  projectSlug: string;
  imageGenerationRequest?: PrepareImageGenerationInput | null;
  videoGenerationRequest?: PrepareVideoGenerationInput | null;
}

export function GenerationsContent({
  generations,
  assets,
  projectSlug,
  imageGenerationRequest = null,
  videoGenerationRequest = null,
}: GenerationsContentProps) {
  const prepareImageAction = prepareImageGenerationAction.bind(null, projectSlug);
  const confirmImageAction = confirmImageGenerationAction.bind(null, projectSlug);
  const prepareVideoAction = prepareVideoGenerationAction.bind(null, projectSlug);
  const confirmVideoAction = confirmVideoGenerationAction.bind(null, projectSlug);

  return (
    <div className="space-y-4">
      {imageGenerationRequest && (
        <ImageGenerationConfirmation
          request={imageGenerationRequest}
          prepareAction={prepareImageAction}
          confirmAction={confirmImageAction}
        />
      )}

      {videoGenerationRequest && (
        <VideoGenerationConfirmation
          request={videoGenerationRequest}
          prepareAction={prepareVideoAction}
          confirmAction={confirmVideoAction}
        />
      )}

      <ShotCostSummary generations={generations} />

      <Card title={`Generations (${generations.length})`}>
        {generations.length === 0 ? (
          <EmptyState title="Nothing generated for this shot yet" />
        ) : (
          <ul className="space-y-2 text-sm">
            {generations.map((generation) => {
              const actionable = generation.status === 'failed' || generation.status === 'pending';
              const retryAction =
                generation.status === 'failed'
                  ? retryFailedGenerationAction.bind(null, projectSlug, generation.id)
                  : undefined;
              const cancelAction =
                generation.status === 'pending'
                  ? cancelPendingGenerationAction.bind(null, projectSlug, generation.id)
                  : undefined;

              return (
                <li
                  key={generation.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={generation.status} />
                      <span className="text-ink-hi">{generation.kind}</span>
                      <Badge>{`${generation.provider}/${generation.model}`}</Badge>
                      <span className="text-xs text-ink-lo">
                        est ${generation.estimatedCostUsd.toFixed(4)} · actual ${generation.actualCostUsd.toFixed(4)} ·
                        attempt {generation.attempts}/{generation.maxAttempts}
                      </span>
                    </div>
                    {generation.errorMessage && (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                        {generation.errorCode}: {generation.errorMessage}
                      </p>
                    )}
                  </div>
                  {actionable && (
                    <GenerationJobControls
                      status={generation.status}
                      retryAction={retryAction}
                      cancelAction={cancelAction}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <AssetCompareReview candidates={assets} />

      <Card title={`Assets (${assets.length})`}>
        {assets.length === 0 ? (
          <EmptyState title="No assets for this shot yet" hint="Queue a generation, then process the queue." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <li key={asset.id} className="rounded-lg border border-line p-2" data-grid-item>
                {asset.mimeType.startsWith('image/') ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className="h-36 w-full rounded border border-line bg-surface-2 object-contain"
                  />
                ) : asset.mimeType.startsWith('audio/') ? (
                  <audio controls src={asset.url} className="w-full" />
                ) : (
                  <div className="flex h-36 items-center justify-center rounded border border-line bg-surface-2 text-xs text-ink-lo">
                    {asset.mimeType}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={asset.approvalState} />
                  <Badge>{asset.kind}</Badge>
                  <span className="text-[11px] text-ink-lo">{(asset.sizeBytes / 1024).toFixed(0)} KB</span>
                </div>
                <p className="mt-1 truncate text-xs text-ink-mid" title={asset.name}>
                  {asset.name}
                </p>
                <Link
                  href={`/projects/${projectSlug}/assets?focus=${asset.id}`}
                  className="mt-2 inline-block text-xs text-brand hover:underline"
                >
                  Lineage →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
