import Link from 'next/link';
import type { CreativeSceneSummary } from '@/application/services/creativeWorkspaceService';
import { InspectorPanel, type InspectorEntity } from './InspectorPanel';

function toInspectorEntity(scene: CreativeSceneSummary): InspectorEntity {
  const metadata = [
    scene.synopsis ? { label: 'Synopsis', value: scene.synopsis } : null,
    { label: 'Time of day', value: scene.timeOfDay },
    { label: 'Location', value: scene.locationName ?? 'Not assigned' },
    { label: 'Duration', value: scene.durationSeconds > 0 ? `${scene.durationSeconds}s` : 'Not set' },
  ].filter((entry): entry is { label: string; value: string } => entry !== null);

  return {
    id: scene.id,
    code: scene.code,
    name: scene.title,
    status: scene.status,
    subtitle: `Scene ${scene.number}`,
    sceneUsage: undefined,
    shotUsage: scene.shotCount,
    metadata: [...metadata, { label: 'Characters', value: String(scene.characterCount) }],
    warnings: scene.warnings,
    // Scene records carry no updatedAt in the domain model — omit rather than guess.
    updatedAt: undefined,
  };
}

/** Read-only Inspector for a selected Scene Board card. The accepted navigation-only contract remains unchanged. */
export function SceneInspector({ scene, slug, onClose }: { scene: CreativeSceneSummary; slug: string; onClose: () => void }) {
  return (
    <InspectorPanel
      entity={toInspectorEntity(scene)}
      onClose={onClose}
      actions={
        <Link
          href={`/projects/${slug}/workspace/shots?scene=${encodeURIComponent(scene.code)}`}
          className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-brand px-3 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
        >
          View shots in this scene →
        </Link>
      }
    />
  );
}
