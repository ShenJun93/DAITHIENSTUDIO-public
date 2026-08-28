'use client';

/**
 * Voice Studio (TASK-006): create/list Voice Profiles, assign one to a
 * character, and queue a voice-synthesis job for a shot's dialogue.
 *
 * A shot's `dialogue` is one flat string, not per-character lines (that is
 * the shot data contract, ADR-005) — so a shot with more than one speaking
 * character gets one voice job, defaulted from its *first* character's
 * profile. The operator can still override every field before queuing.
 */
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import type { AssetRecord, CharacterRecord, GenerationRecord, ShotRecord, VoiceProfileRecord } from '@/application/records';
import type { EnqueueVoiceGenerationInput } from '@/domain/schemas';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Notice, StatusBadge, inputClass } from './ui';

interface ShotVoiceState {
  shot: ShotRecord;
  voiceGenerations: GenerationRecord[];
  voiceAssets: AssetRecord[];
}

interface VoiceStudioProps {
  projectLanguage: string;
  voiceProfiles: VoiceProfileRecord[];
  characters: CharacterRecord[];
  shotVoiceState: ShotVoiceState[];
  createProfileAction: (form: FormData) => Promise<ActionResult>;
  updateProfileAction: (profileId: string, form: FormData) => Promise<ActionResult>;
  deleteProfileAction: (profileId: string) => Promise<ActionResult>;
  assignProfileAction: (characterId: string, voiceProfileId: string | null) => Promise<ActionResult>;
  enqueueAction: (input: EnqueueVoiceGenerationInput) => Promise<ActionResult>;
}

export function VoiceStudio({
  projectLanguage,
  voiceProfiles,
  characters,
  shotVoiceState,
  createProfileAction,
  updateProfileAction,
  deleteProfileAction,
  assignProfileAction,
  enqueueAction,
}: VoiceStudioProps) {
  return (
    <div className="space-y-5">
      <Card title={`Voice Profiles (${voiceProfiles.length})`}>
        <VoiceProfileSection
          voiceProfiles={voiceProfiles}
          createProfileAction={createProfileAction}
          updateProfileAction={updateProfileAction}
          deleteProfileAction={deleteProfileAction}
        />
      </Card>

      <Card title="Character voices">
        <CharacterVoiceSection characters={characters} voiceProfiles={voiceProfiles} assignProfileAction={assignProfileAction} />
      </Card>

      <Card title={`Shots with dialogue (${shotVoiceState.length})`}>
        <ShotVoiceSection
          items={shotVoiceState}
          characters={characters}
          voiceProfiles={voiceProfiles}
          projectLanguage={projectLanguage}
          enqueueAction={enqueueAction}
        />
      </Card>
    </div>
  );
}

function VoiceProfileSection({
  voiceProfiles,
  createProfileAction,
  updateProfileAction,
  deleteProfileAction,
}: {
  voiceProfiles: VoiceProfileRecord[];
  createProfileAction: (form: FormData) => Promise<ActionResult>;
  updateProfileAction: (profileId: string, form: FormData) => Promise<ActionResult>;
  deleteProfileAction: (profileId: string) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setResult(null);
    startTransition(async () => {
      const outcome = await createProfileAction(form);
      setResult(outcome);
      if (outcome.ok) formEl.reset();
    });
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={submit}
        className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-3"
        aria-label="Create voice profile"
      >
        <Field label="Name">
          <input name="name" required maxLength={120} className={inputClass} placeholder="e.g. Triệu Ngốc — vi-VN" />
        </Field>
        <Field label="Language">
          <input name="language" defaultValue="vi-VN" maxLength={12} className={inputClass} />
        </Field>
        <Field label="Voice name">
          <input name="voiceName" maxLength={120} className={inputClass} placeholder="provider voice id" />
        </Field>
        <Field label="Speed">
          <input name="speed" type="number" step="0.05" min="0.25" max="4" defaultValue="1" className={inputClass} />
        </Field>
        <Field label="Pitch">
          <input name="pitch" type="number" step="1" min="-20" max="20" defaultValue="0" className={inputClass} />
        </Field>
        <Field label="Emotion">
          <input name="emotion" defaultValue="neutral" maxLength={60} className={inputClass} />
        </Field>
        <Field label="Style">
          <input name="style" maxLength={200} className={inputClass} />
        </Field>
        <div className="flex items-end sm:col-span-3">
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? 'Creating…' : 'Create voice profile'}
          </Button>
        </div>
      </form>

      {result && !result.ok && <ErrorState title="Could not create profile" detail={`${result.message} (${result.code ?? ''})`} />}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}

      {voiceProfiles.length === 0 ? (
        <EmptyState title="No voice profiles yet" hint="Create one above, then assign it to a character below." />
      ) : (
        <div className="space-y-2">
          {voiceProfiles.map((profile) => (
            <VoiceProfileRow
              key={profile.id}
              profile={profile}
              updateProfileAction={updateProfileAction}
              deleteProfileAction={deleteProfileAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceProfileRow({
  profile,
  updateProfileAction,
  deleteProfileAction,
}: {
  profile: VoiceProfileRecord;
  updateProfileAction: (profileId: string, form: FormData) => Promise<ActionResult>;
  deleteProfileAction: (profileId: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await updateProfileAction(profile.id, form);
      setResult(outcome);
      if (outcome.ok) setEditing(false);
    });
  };

  const deleteProfile = (): void => {
    if (!confirm(`Are you sure you want to delete "${profile.name}"?`)) return;
    setResult(null);
    startTransition(async () => {
      setResult(await deleteProfileAction(profile.id));
    });
  };

  if (!editing) {
    return (
      <div className="rounded-lg border border-line p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium text-ink-hi">{profile.name}</span>
            <span className="ml-2 text-xs text-ink-mid">({profile.provider})</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button type="button" variant="danger" onClick={deleteProfile} disabled={pending}>
              Delete
            </Button>
          </div>
        </div>
        <div className="text-xs text-ink-mid flex flex-wrap gap-3">
          <span>Language: {profile.language}</span>
          <span>Voice: {profile.voiceName || '—'}</span>
          <span>Speed: {profile.speed}×</span>
          <span>Pitch: {profile.pitch}</span>
          <span>Emotion: {profile.emotion || '—'}</span>
        </div>
        {result && !result.ok && <ErrorState title="Error" detail={`${result.message} (${result.code ?? ''})`} />}
        {result?.ok && <Notice tone="success">{result.message}</Notice>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-3" aria-label={`Edit ${profile.name}`}>
        <Field label="Name">
          <input name="name" defaultValue={profile.name} required maxLength={120} className={inputClass} />
        </Field>
        <Field label="Language">
          <input name="language" defaultValue={profile.language} maxLength={12} className={inputClass} />
        </Field>
        <Field label="Voice name">
          <input name="voiceName" defaultValue={profile.voiceName} maxLength={120} className={inputClass} />
        </Field>
        <Field label="Speed">
          <input name="speed" type="number" step="0.05" min="0.25" max="4" defaultValue={profile.speed} className={inputClass} />
        </Field>
        <Field label="Pitch">
          <input name="pitch" type="number" step="1" min="-20" max="20" defaultValue={profile.pitch} className={inputClass} />
        </Field>
        <Field label="Emotion">
          <input name="emotion" defaultValue={profile.emotion} maxLength={60} className={inputClass} />
        </Field>
        <Field label="Style">
          <input name="style" defaultValue={profile.style} maxLength={200} className={inputClass} />
        </Field>
        <div className="flex items-end gap-2 sm:col-span-3">
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
      {result && !result.ok && <ErrorState title="Error" detail={`${result.message} (${result.code ?? ''})`} />}
    </div>
  );
}

function CharacterVoiceSection({
  characters,
  voiceProfiles,
  assignProfileAction,
}: {
  characters: CharacterRecord[];
  voiceProfiles: VoiceProfileRecord[];
  assignProfileAction: (characterId: string, voiceProfileId: string | null) => Promise<ActionResult>;
}) {
  if (characters.length === 0) {
    return <EmptyState title="No characters yet" hint="Parse a script first — characters are created from it." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-lo">
            <th className="px-2 py-2 font-medium">Character</th>
            <th className="px-2 py-2 font-medium">Voice profile</th>
            <th className="px-2 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {characters.map((character) => (
            <CharacterVoiceRow
              key={character.id}
              character={character}
              voiceProfiles={voiceProfiles}
              assignProfileAction={assignProfileAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CharacterVoiceRow({
  character,
  voiceProfiles,
  assignProfileAction,
}: {
  character: CharacterRecord;
  voiceProfiles: VoiceProfileRecord[];
  assignProfileAction: (characterId: string, voiceProfileId: string | null) => Promise<ActionResult>;
}) {
  const [selected, setSelected] = useState(character.voiceProfileId ?? '');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const dirty = selected !== (character.voiceProfileId ?? '');

  const save = (): void => {
    setResult(null);
    startTransition(async () => {
      setResult(await assignProfileAction(character.id, selected || null));
    });
  };

  return (
    <tr className="border-b border-line/60 align-top">
      <td className="px-2 py-2 text-ink-hi">
        {character.name} <span className="font-mono text-xs text-ink-lo">{character.code}</span>
      </td>
      <td className="px-2 py-2">
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={pending}
          aria-label={`Voice profile for ${character.name}`}
          className={inputClass}
        >
          <option value="">— none —</option>
          {voiceProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-col items-start gap-1">
          <Button type="button" variant="ghost" onClick={save} disabled={pending || !dirty} aria-busy={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          {result && (
            <span
              role="status"
              className={`text-xs ${result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
            >
              {result.ok ? '✓ ' : '✕ '}
              {result.message}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function voiceShotStatus(state: ShotVoiceState): { label: string; badge: string | null } {
  const approved = state.voiceAssets.find((asset) => asset.approvalState === 'approved');
  if (approved) return { label: 'approved', badge: 'approved' };
  const pendingAsset = state.voiceAssets.find((asset) => asset.approvalState === 'pending');
  if (pendingAsset) return { label: 'pending review', badge: 'pending' };
  const active = state.voiceGenerations.find((g) => g.status === 'pending' || g.status === 'processing');
  if (active) return { label: active.status, badge: active.status };
  const failed = state.voiceGenerations.find((g) => g.status === 'failed');
  if (failed) return { label: 'failed', badge: 'failed' };
  return { label: 'no voice yet', badge: null };
}

function ShotVoiceSection({
  items,
  characters,
  voiceProfiles,
  projectLanguage,
  enqueueAction,
}: {
  items: ShotVoiceState[];
  characters: CharacterRecord[];
  voiceProfiles: VoiceProfileRecord[];
  projectLanguage: string;
  enqueueAction: (input: EnqueueVoiceGenerationInput) => Promise<ActionResult>;
}) {
  if (items.length === 0) {
    return <EmptyState title="No shots have dialogue yet" hint="Dialogue comes from the parsed script." />;
  }

  const characterById = new Map(characters.map((character) => [character.id, character]));
  const profileById = new Map(voiceProfiles.map((profile) => [profile.id, profile]));

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const firstCharacter = item.shot.characters[0] ? characterById.get(item.shot.characters[0].characterId) : undefined;
        const resolvedProfile = firstCharacter?.voiceProfileId ? profileById.get(firstCharacter.voiceProfileId) : undefined;
        const status = voiceShotStatus(item);

        return (
          <ShotVoiceRow
            key={item.shot.id}
            shot={item.shot}
            characterNames={item.shot.characters
              .map((ref) => characterById.get(ref.characterId)?.name ?? ref.characterId.slice(0, 8))
              .join(', ')}
            resolvedProfile={resolvedProfile}
            statusLabel={status.label}
            statusBadge={status.badge}
            projectLanguage={projectLanguage}
            enqueueAction={enqueueAction}
          />
        );
      })}
    </div>
  );
}

function ShotVoiceRow({
  shot,
  characterNames,
  resolvedProfile,
  statusLabel,
  statusBadge,
  projectLanguage,
  enqueueAction,
}: {
  shot: ShotRecord;
  characterNames: string;
  resolvedProfile: VoiceProfileRecord | undefined;
  statusLabel: string;
  statusBadge: string | null;
  projectLanguage: string;
  enqueueAction: (input: EnqueueVoiceGenerationInput) => Promise<ActionResult>;
}) {
  const [language, setLanguage] = useState(resolvedProfile?.language ?? projectLanguage);
  const [voiceName, setVoiceName] = useState(resolvedProfile?.voiceName ?? '');
  const [speed, setSpeed] = useState(resolvedProfile?.speed ?? 1);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const queue = (): void => {
    setResult(null);
    startTransition(async () => {
      setResult(
        await enqueueAction({
          shotId: shot.id,
          voiceProfileId: resolvedProfile?.id ?? null,
          language,
          voiceName,
          speed,
        }),
      );
    });
  };

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-ink-lo">
            {shot.code} · {characterNames || 'no cast'}
          </p>
          <p className="mt-1 text-sm text-ink-hi">{shot.dialogue}</p>
          <p className="mt-1 text-xs text-ink-mid">
            {resolvedProfile ? `Resolved profile: ${resolvedProfile.name}` : 'No voice profile assigned to the first character.'}
          </p>
        </div>
        {statusBadge ? <StatusBadge status={statusBadge} /> : <Badge>{statusLabel}</Badge>}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <Field label="Language">
          <input value={language} onChange={(event) => setLanguage(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Voice name">
          <input value={voiceName} onChange={(event) => setVoiceName(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Speed">
          <input
            type="number"
            step="0.05"
            min="0.25"
            max="4"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className={inputClass}
          />
        </Field>
        <div className="flex items-end">
          <Button type="button" onClick={queue} disabled={pending} aria-busy={pending}>
            {pending ? 'Queuing…' : 'Queue voice'}
          </Button>
        </div>
      </div>

      {result && !result.ok && <ErrorState title="Could not queue" detail={`${result.message} (${result.code ?? ''})`} />}
      {result?.ok && <Notice tone="success">{result.message}</Notice>}
    </div>
  );
}
