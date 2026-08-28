'use client';

import { Button, ErrorState } from '@/components/ui';

export default function ShotStoryboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorState
        title="Shot Storyboard could not be loaded"
        detail="Error code: SHOT_STORYBOARD_FAILED. Check the local database connection, then try again."
      />
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
