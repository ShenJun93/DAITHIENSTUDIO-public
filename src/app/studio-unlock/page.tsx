import { Card } from '@/components/ui';
import { StudioUnlockForm } from '@/components/StudioUnlockForm';

export const dynamic = 'force-dynamic';

export default function StudioUnlockPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center px-4 py-10">
      <div className="w-full space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-lo">Operator security</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-hi">Unlock studio mutations</h1>
          <p className="mt-2 text-sm text-ink-mid">
            Use the configured studio key to authorize create, update, approval, generation, and export actions in this browser.
          </p>
        </div>
        <Card title="Browser authorization">
          <StudioUnlockForm />
        </Card>
      </div>
    </main>
  );
}
