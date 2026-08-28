'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  lockStudioAction,
  unlockStudioAction,
  type StudioUnlockResult,
} from '@/app/studio-unlock/actions';
import { Button, ErrorState, Field, Notice, inputClass } from '@/components/ui';

export function StudioUnlockForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<StudioUnlockResult | null>(null);

  return (
    <div className="space-y-4">
      {result && !result.ok && (
        <ErrorState title="Studio remains locked" detail={`${result.message}${result.code ? ` (${result.code})` : ''}`} />
      )}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}

      <form
        ref={formRef}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setResult(null);
          startTransition(async () => {
            const next = await unlockStudioAction(form);
            formRef.current?.reset();
            setResult(next);
            if (next.ok && next.redirectTo) {
              router.push(next.redirectTo);
              router.refresh();
            }
          });
        }}
      >
        <Field label="Studio key" hint="The key is submitted only to the server and is never stored in browser state.">
          <input
            name="apiKey"
            type="password"
            autoComplete="current-password"
            required
            maxLength={512}
            className={inputClass}
          />
        </Field>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Unlocking…' : 'Unlock mutations'}
        </Button>
      </form>

      <div className="border-t border-line pt-4">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setResult(null);
            startTransition(async () => setResult(await lockStudioAction()));
          }}
        >
          Lock this browser
        </Button>
      </div>
    </div>
  );
}
