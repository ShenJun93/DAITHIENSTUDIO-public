'use client';

import { Button, ErrorState } from '@/components/ui';

export default function LocationBrowserError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorState
        title="Location Browser could not be loaded"
        detail="Error code: LOCATION_BROWSER_FAILED. Check the local database connection, then try again."
      />
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
