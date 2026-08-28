'use client';

import { Button, ErrorState } from '@/components/ui';

export default function ProjectWorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorState
        title="Project workspace could not be loaded"
        detail="Error code: PROJECT_ROUTE_FAILED. Check the local database connection, then try again."
      />
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
