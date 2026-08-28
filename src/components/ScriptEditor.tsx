'use client';

/** Script editor with an explicit save state and a guarded re-parse. */
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import { Button, ErrorState, Notice, SavedIndicator, inputClass } from './ui';

export function ScriptEditor({
  initialRaw,
  savedAt,
  hasScenes,
  saveAction,
  parseAction,
}: {
  initialRaw: string;
  savedAt: string | null;
  hasScenes: boolean;
  saveAction: (form: FormData) => Promise<ActionResult>;
  parseAction: (replaceExisting: boolean) => Promise<ActionResult>;
}) {
  const [raw, setRaw] = useState(initialRaw);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const save = (): void => {
    const form = new FormData();
    form.set('raw', raw);
    form.set('title', 'Main script');
    form.set('scriptType', 'motion-comic');
    setResult(null);
    startTransition(async () => {
      const outcome = await saveAction(form);
      setResult(outcome);
      if (outcome.ok) setDirty(false);
    });
  };

  const parse = (): void => {
    if (hasScenes && !window.confirm('This project already has scenes. Re-parsing replaces them. Continue?')) return;
    setResult(null);
    startTransition(async () => {
      setResult(await parseAction(hasScenes));
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {dirty ? (
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              <span aria-hidden="true">● </span>Unsaved changes
            </span>
          ) : (
            <SavedIndicator savedAt={savedAt} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={pending || !dirty} aria-busy={pending}>
            {pending ? 'Saving…' : 'Save script'}
          </Button>
          <Button type="button" variant="ghost" onClick={parse} disabled={pending || dirty || raw.trim().length === 0}>
            {hasScenes ? 'Re-parse into scenes' : 'Parse into scenes'}
          </Button>
        </div>
      </div>

      {dirty && <Notice tone="warning">Save before parsing — the parser reads the stored script, not the textarea.</Notice>}

      {result && !result.ok && <ErrorState title="Action failed" detail={`${result.message} (${result.code ?? ''})`} />}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}

      <textarea
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value);
          setDirty(true);
        }}
        rows={26}
        spellCheck={false}
        aria-label="Script"
        className={`${inputClass} font-mono text-[13px] leading-relaxed`}
        placeholder={'CẢNH 1 - HANG ĐỘNG - ĐÊM\n\nHành động…\n\nTÊN NHÂN VẬT: Lời thoại…'}
      />
      <p className="text-xs text-ink-lo">
        Scene headings: <code>CẢNH 1 - ĐỊA ĐIỂM - ĐÊM</code> or <code>INT. LOCATION - DAY</code>. Dialogue:{' '}
        <code>TÊN: lời thoại</code>, optionally <code>TÊN (cảm xúc): lời thoại</code>.
      </p>
    </div>
  );
}
