import { Card } from '@/components/ui';

export default function ProjectWorkspaceLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <Card title="Loading project workspace">
        <p className="text-sm text-ink-mid">
          Loading the latest persisted project data…
        </p>
      </Card>
    </div>
  );
}
