'use client';

import { Button, Card, ErrorState } from '@/components/ui';

export default function ScenesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card title="Scenes">
      <div className="space-y-3">
        <ErrorState
          title="The scene list could not be loaded"
          detail="Error code: SCENES_LIST_FAILED. Check the local database connection, then try again."
        />
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </Card>
  );
}
