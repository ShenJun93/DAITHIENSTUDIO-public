'use client';

/**
 * Story Development editor: premise -> logline / synopsis / theme / tone /
 * hook / cliffhanger / beats, one row per part. A part can be edited freely
 * until it is accepted; an accepted part renders read-only with a lock badge
 * and must be explicitly unlocked before it can be edited or regenerated
 * again — regeneration never silently overwrites an accepted part.
 */
import { useEffect, useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import type { CreativeBrief, SaveStoryInput, StoryBeat, StoryPart } from '@/domain/schemas';
import { Badge, Button, ErrorState, Field, Notice, inputClass } from './ui';

const TEXT_PARTS: { key: Exclude<StoryPart, 'beats'>; label: string; rows: number }[] = [
  { key: 'logline', label: 'Logline', rows: 2 },
  { key: 'synopsis', label: 'Synopsis', rows: 5 },
  { key: 'theme', label: 'Theme', rows: 2 },
  { key: 'tone', label: 'Tone', rows: 2 },
  { key: 'hook', label: 'Hook', rows: 2 },
  { key: 'cliffhanger', label: 'Cliffhanger', rows: 2 },
];

interface StoryActions {
  generateAction: (premise: string) => Promise<ActionResult>;
  regenerateAction: (part: StoryPart, premise?: string) => Promise<ActionResult>;
  saveAction: (values: SaveStoryInput) => Promise<ActionResult>;
  acceptAction: (parts: StoryPart[], values?: SaveStoryInput) => Promise<ActionResult>;
  unlockAction: (parts: StoryPart[]) => Promise<ActionResult>;
}

export function StoryEditor({
  brief,
  approvedParts,
  updatedAt,
  ...actions
}: { brief: CreativeBrief; approvedParts: StoryPart[]; updatedAt: string } & StoryActions) {
  const [premise, setPremise] = useState(brief.premise);
  const [draft, setDraft] = useState<CreativeBrief>(brief);
  const [locked, setLocked] = useState<Set<StoryPart>>(new Set(approvedParts));
  const [pendingPart, setPendingPart] = useState<StoryPart | 'premise' | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  // Re-sync from the server only when the project actually changed (a
  // successful mutation revalidates the page). Keyed on `updatedAt` rather
  // than remounting the whole component on a `key` prop, so a just-set
  // result message survives the resync instead of being wiped by it.
  useEffect(() => {
    setPremise(brief.premise);
    setDraft(brief);
    setLocked(new Set(approvedParts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedAt]);

  const isLocked = (part: StoryPart): boolean => locked.has(part);

  const run = (part: StoryPart | 'premise', task: () => Promise<ActionResult>): void => {
    setPendingPart(part);
    setResult(null);
    startTransition(async () => {
      const outcome = await task();
      setResult(outcome);
      setPendingPart(null);
    });
  };

  const generate = (): void => {
    if (!premise.trim()) return;
    run('premise', async () => {
      const outcome = await actions.generateAction(premise);
      return outcome;
    });
  };

  const setText = (part: Exclude<StoryPart, 'beats'>, value: string): void => {
    setDraft((prev) => ({ ...prev, [part]: value }));
  };

  const saveText = (part: Exclude<StoryPart, 'beats'>): void => {
    run(part, () => actions.saveAction({ [part]: draft[part] } as SaveStoryInput));
  };

  const regenerate = (part: StoryPart): void => {
    run(part, () => actions.regenerateAction(part, premise || undefined));
  };

  const accept = (part: StoryPart, values: SaveStoryInput): void => {
    run(part, async () => {
      const outcome = await actions.acceptAction([part], values);
      if (outcome.ok) setLocked((prev) => new Set(prev).add(part));
      return outcome;
    });
  };

  const unlock = (part: StoryPart): void => {
    run(part, async () => {
      const outcome = await actions.unlockAction([part]);
      if (outcome.ok) {
        setLocked((prev) => {
          const next = new Set(prev);
          next.delete(part);
          return next;
        });
      }
      return outcome;
    });
  };

  const setBeat = (index: number, field: 'title' | 'description', value: string): void => {
    setDraft((prev) => ({
      ...prev,
      beats: prev.beats.map((beat, i) => (i === index ? { ...beat, [field]: value } : beat)),
    }));
  };

  return (
    <div className="space-y-5">
      <Field label="Premise" hint="What the operator wants the story to be about. Used for both the initial generation and every later regenerate.">
        <textarea
          value={premise}
          onChange={(event) => setPremise(event.target.value)}
          rows={3}
          className={`${inputClass} leading-relaxed`}
          placeholder="Một tu sĩ tự xưng thiên tài nhưng kiếm thuật kém cỏi..."
        />
      </Field>
      <Button type="button" onClick={generate} disabled={pending || !premise.trim()} aria-busy={pending && pendingPart === 'premise'}>
        {pending && pendingPart === 'premise' ? 'Generating…' : brief.logline || brief.synopsis ? 'Regenerate all unlocked parts' : 'Generate story development'}
      </Button>

      {result && !result.ok && <ErrorState title="Action failed" detail={`${result.message} (${result.code ?? ''})`} />}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}

      <div className="grid gap-4 md:grid-cols-2">
        {TEXT_PARTS.map(({ key, label, rows }) => {
          const partLocked = isLocked(key);
          const partPending = pending && pendingPart === key;
          return (
            <div key={key} className="space-y-1.5 rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-lo">{label}</span>
                {partLocked && <Badge>locked</Badge>}
              </div>
              <textarea
                value={draft[key]}
                onChange={(event) => setText(key, event.target.value)}
                rows={rows}
                readOnly={partLocked}
                aria-label={label}
                className={`${inputClass} ${partLocked ? 'opacity-70' : ''}`}
              />
              <div className="flex flex-wrap gap-1.5">
                {partLocked ? (
                  <Button type="button" variant="ghost" onClick={() => unlock(key)} disabled={pending} aria-busy={partPending}>
                    Unlock
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => saveText(key)}
                      disabled={pending || draft[key] === brief[key]}
                      aria-busy={partPending}
                    >
                      Save
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => regenerate(key)} disabled={pending} aria-busy={partPending}>
                      Regenerate
                    </Button>
                    <Button
                      type="button"
                      onClick={() => accept(key, { [key]: draft[key] } as SaveStoryInput)}
                      disabled={pending}
                      aria-busy={partPending}
                    >
                      Accept
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 rounded-lg border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-lo">Beats (three-act)</span>
          {isLocked('beats') && <Badge>locked</Badge>}
        </div>
        {draft.beats.length === 0 ? (
          <p className="text-sm text-ink-mid">No beats yet — generate a story development first.</p>
        ) : (
          <div className="space-y-2">
            {draft.beats.map((beat: StoryBeat, index) => (
              <div key={beat.act} className="rounded-md border border-line/60 p-2">
                <div className="mb-1 text-xs font-mono text-ink-lo">Act {beat.act}</div>
                <input
                  value={beat.title}
                  onChange={(event) => setBeat(index, 'title', event.target.value)}
                  readOnly={isLocked('beats')}
                  aria-label={`Act ${beat.act} title`}
                  className={`${inputClass} mb-1 ${isLocked('beats') ? 'opacity-70' : ''}`}
                  placeholder="Beat title"
                />
                <textarea
                  value={beat.description}
                  onChange={(event) => setBeat(index, 'description', event.target.value)}
                  rows={2}
                  readOnly={isLocked('beats')}
                  aria-label={`Act ${beat.act} description`}
                  className={`${inputClass} ${isLocked('beats') ? 'opacity-70' : ''}`}
                  placeholder="What happens in this act"
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {isLocked('beats') ? (
            <Button type="button" variant="ghost" onClick={() => unlock('beats')} disabled={pending} aria-busy={pending && pendingPart === 'beats'}>
              Unlock
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => run('beats', () => actions.saveAction({ beats: draft.beats }))}
                disabled={pending || draft.beats.length === 0}
                aria-busy={pending && pendingPart === 'beats'}
              >
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={() => regenerate('beats')} disabled={pending} aria-busy={pending && pendingPart === 'beats'}>
                Regenerate
              </Button>
              <Button
                type="button"
                onClick={() => accept('beats', { beats: draft.beats })}
                disabled={pending || draft.beats.length === 0}
                aria-busy={pending && pendingPart === 'beats'}
              >
                Accept
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
