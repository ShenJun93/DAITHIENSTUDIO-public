'use client';

import { Button, Card, ErrorState } from '@/components/ui';

export default function CharacterCreateError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card title="New character" className="mx-auto max-w-2xl">
      <div className="space-y-3">
        <ErrorState
          title="The character create form could not be loaded"
          detail="Error code: CHARACTER_CREATE_FAILED. Check the local database connection, then try again."
        />
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </Card>
  );
}
