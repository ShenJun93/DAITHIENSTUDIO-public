'use client';

import { Button, ErrorState } from '@/components/ui';

export default function CharacterBrowserError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorState
        title="Character Browser could not be loaded"
        detail="Error code: CHARACTER_BROWSER_FAILED. Check the local database connection, then try again."
      />
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
