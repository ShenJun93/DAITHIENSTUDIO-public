'use client';

import { Button, Card, ErrorState } from '@/components/ui';

export default function LocationCreateError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card title="New location" className="mx-auto max-w-2xl">
      <div className="space-y-3">
        <ErrorState
          title="The location create form could not be loaded"
          detail="Error code: LOCATION_CREATE_FAILED. Check the local database connection, then try again."
        />
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </Card>
  );
}
