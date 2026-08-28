'use client';

import { Button, Card, ErrorState } from '@/components/ui';

export default function SceneEditError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card title="Edit scene">
      <div className="space-y-3">
        <ErrorState
          title="The scene editor could not be loaded"
          detail="Error code: SCENE_EDIT_FAILED. Check the local database connection, then try again."
        />
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </Card>
  );
}
