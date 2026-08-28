'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import type { CreativeShotSummary } from '@/application/services/creativeWorkspaceService';
import { InspectorPanel, type InspectorEntity } from './InspectorPanel';
import { inspectShotPromptAction } from '@/app/actions';
import { PromptsContent } from '../shot-inspector/PromptsContent';

function toInspectorEntity(shot: CreativeShotSummary): InspectorEntity {
  const metadata = [
    shot.description ? { label: 'Description', value: shot.description } : null,
    { label: 'Framing', value: `${shot.shotSize} · ${shot.cameraAngle}` },
    { label: 'Duration', value: `${shot.durationSeconds}s` },
    { label: 'Prompts compiled', value: String(shot.promptCount) },
    { label: 'Asset coverage', value: `${shot.assetCoverage.approved} approved / ${shot.assetCoverage.total} total` },
    { label: 'Render status', value: shot.generationStatus ?? 'Not started' },
  ].filter((entry): entry is { label: string; value: string } => entry !== null);

  return {
    id: shot.id,
    code: shot.code,
    name: shot.title || `Shot ${shot.shotNumber}`,
    status: shot.status,
    subtitle: shot.sceneCode,
    metadata,
    warnings: shot.warnings,
    updatedAt: shot.updatedAt,
  };
}

/** Read-only Inspector for a selected Shot Storyboard card. Extends the Slice 2 Inspector pattern; no editing, no render controls. */
export function ShotInspector({ shot, onClose }: { shot: CreativeShotSummary; onClose: () => void }) {
  const params = useParams() || {};
  const projectSlug = (params.slug as string) ?? (params.projectSlug as string) ?? 'mock-slug';
  const [promptData, setPromptData] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectSlug || !shot.id) return;

    startTransition(async () => {
      try {
        const result = await inspectShotPromptAction(projectSlug, shot.id);
        if (result.ok && result.data) {
          setPromptData(result.data);
          setError(null);
        } else {
          setError(result.message || 'Failed to load prompt data');
        }
      } catch {
        setError('Error loading prompt data');
      }
    });
  }, [projectSlug, shot.id]);

  const actions = (
    <div className="mt-8 space-y-8 border-t pt-8">
      <section aria-label="Shot workspace action">
        <p className="mb-3 text-sm text-ink-mid">
          Continue with the accepted shot inspection, references, prompts, visual control, and generation evidence without losing this shot context.
        </p>
        <Link
          href={`/projects/${projectSlug}/shots/${encodeURIComponent(shot.code)}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface-0 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1"
        >
          Open shot workspace →
        </Link>
      </section>

      <section className="border-t pt-8">
        <h2 className="mb-4 text-sm font-semibold text-ink-hi">Prompt Generation Preview</h2>
        {isPending && <p className="text-sm text-ink-mid">Loading prompt data...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!isPending && !error && promptData && (
          <PromptsContent
            imageData={promptData.imageData}
            videoData={promptData.videoData}
            requiredRefs={promptData.requiredRefs}
            ingredients={promptData.ingredients}
            basePath={`/projects/${projectSlug}`}
          />
        )}
      </section>
    </div>
  );

  return <InspectorPanel entity={toInspectorEntity(shot)} onClose={onClose} actions={actions} />;
}
