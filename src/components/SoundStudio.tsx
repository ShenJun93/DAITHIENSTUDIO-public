'use client';

import { useId, useState, useTransition } from 'react';
import type { AudioMix, AudioTrack } from '@/domain/schemas';
import type { AssetRecord } from '@/application/records';
import type { ActionResult } from '@/app/actions';
import { Button, Card, EmptyState, Notice, Field, inputClass, Badge } from './ui';

export function SoundStudio({
  episodeId,
  initialMix,
  audioAssets,
  saveMixAction,
}: {
  episodeId: string;
  initialMix: AudioMix;
  audioAssets: AssetRecord[];
  saveMixAction: (mix: AudioMix) => Promise<ActionResult>;
}) {
  const [mix, setMix] = useState<AudioMix>(initialMix);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const timelineHelpId = useId();

  // Sort tracks into layers
  const dialogueTracks = mix.tracks.filter(t => t.layer === 'dialogue');
  const foleyTracks = mix.tracks.filter(t => t.layer === 'foley');
  const musicTracks = mix.tracks.filter(t => t.layer === 'music');

  const selectedTrack = mix.tracks.find(t => t.id === selectedTrackId);
  const selectedAsset = selectedTrack ? audioAssets.find(a => a.id === selectedTrack.assetId) : undefined;

  const updateTrack = (trackId: string, updates: Partial<AudioTrack>) => {
    setMix(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => (t.id === trackId ? { ...t, ...updates } : t))
    }));
  };

  const addTrack = (asset: AssetRecord) => {
    const layer = asset.kind === 'voice' ? 'dialogue' : asset.kind === 'sound' ? 'foley' : 'music';
    const newTrack: AudioTrack = {
      id: `trk_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      mixId: mix.id,
      layer,
      assetId: asset.id,
      shotId: asset.shotId,
      generationId: asset.generationId,
      startTimeSeconds: 0,
      durationSeconds: asset.durationSeconds || 5,
      gainDb: 0,
      muted: false,
    };
    setMix(prev => ({
      ...prev,
      tracks: [...prev.tracks, newTrack]
    }));
    setSelectedTrackId(newTrack.id);
  };

  const removeTrack = (trackId: string) => {
    setMix(prev => ({ ...prev, tracks: prev.tracks.filter(t => t.id !== trackId) }));
    if (selectedTrackId === trackId) setSelectedTrackId(null);
  };

  const moveTrack = (trackId: string, direction: -1 | 1) => {
    setMix((previous) => {
      const index = previous.tracks.findIndex((track) => track.id === trackId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= previous.tracks.length) return previous;
      const tracks = [...previous.tracks];
      [tracks[index], tracks[target]] = [tracks[target]!, tracks[index]!];
      return { ...previous, tracks };
    });
  };

  const save = () => {
    setError('');
    setSuccess('');
    startTransition(async () => {
      const result = await saveMixAction(mix);
      if (result.ok) setSuccess(result.message);
      else setError(result.message ?? 'Save failed');
    });
  };

  // Keyboard controls
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedTrackId) return;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      removeTrack(selectedTrackId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const trk = mix.tracks.find(t => t.id === selectedTrackId);
      if (trk) updateTrack(selectedTrackId, { startTimeSeconds: Math.max(0, trk.startTimeSeconds - 0.5) });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const trk = mix.tracks.find(t => t.id === selectedTrackId);
      if (trk) updateTrack(selectedTrackId, { startTimeSeconds: trk.startTimeSeconds + 0.5 });
    } else if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      const trk = mix.tracks.find(t => t.id === selectedTrackId);
      if (trk) updateTrack(selectedTrackId, { muted: !trk.muted });
    }
  };

  const pixelsPerSecond = 20;

  return (
    <div className="space-y-4">
      {error && <Notice tone="warning">Save failed: {error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      <Card
        title="Timeline"
        action={
          <Button onClick={save} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Mix'}
          </Button>
        }
      >
        <div
          className="overflow-x-auto rounded-md border border-line bg-surface-1 p-4"
          tabIndex={0}
          role="region"
          aria-label="Audio mix timeline"
          aria-describedby={timelineHelpId}
          onKeyDown={handleKeyDown}
        >
          <div className="relative min-w-[800px] space-y-4">

            {/* Dialogue Layer */}
            <TimelineLayer
              name="Dialogue"
              tracks={dialogueTracks}
              assets={audioAssets}
              pps={pixelsPerSecond}
              selectedId={selectedTrackId}
              onSelect={setSelectedTrackId}
            />

            {/* Foley Layer */}
            <TimelineLayer
              name="Foley / Sound"
              tracks={foleyTracks}
              assets={audioAssets}
              pps={pixelsPerSecond}
              selectedId={selectedTrackId}
              onSelect={setSelectedTrackId}
            />

            {/* Music Layer */}
            <TimelineLayer
              name="Music"
              tracks={musicTracks}
              assets={audioAssets}
              pps={pixelsPerSecond}
              selectedId={selectedTrackId}
              onSelect={setSelectedTrackId}
            />
          </div>
        </div>
        <p id={timelineHelpId} className="mt-2 text-xs text-ink-lo">
          Use Left/Right arrows to nudge selected track by 0.5s. Use Delete/Backspace to remove. Press &apos;M&apos; to mute.
        </p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Inspector">
          {selectedTrack ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{selectedAsset?.name || 'Unknown Asset'}</p>
              <div className="flex gap-2">
                <Badge>
                  {selectedTrack.muted ? 'Muted' : 'Active'}
                </Badge>
                <Badge>{selectedTrack.layer}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Time (s)">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={selectedTrack.startTimeSeconds}
                    onChange={(e) => updateTrack(selectedTrack.id, { startTimeSeconds: parseFloat(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Duration (s)">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={selectedTrack.durationSeconds}
                    onChange={(e) => updateTrack(selectedTrack.id, { durationSeconds: parseFloat(e.target.value) || 1 })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Gain (dB)">
                  <input
                    type="number"
                    step="0.5"
                    value={selectedTrack.gainDb}
                    onChange={(e) => updateTrack(selectedTrack.id, { gainDb: parseFloat(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="pt-2 flex gap-2">
                <Button variant="ghost" onClick={() => moveTrack(selectedTrack.id, -1)}>
                  Move Earlier
                </Button>
                <Button variant="ghost" onClick={() => moveTrack(selectedTrack.id, 1)}>
                  Move Later
                </Button>
                <Button variant="ghost" onClick={() => updateTrack(selectedTrack.id, { muted: !selectedTrack.muted })}>
                  {selectedTrack.muted ? 'Unmute' : 'Mute'}
                </Button>
                <Button variant="danger" onClick={() => removeTrack(selectedTrack.id)}>
                  Remove Track
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState title="No track selected" hint="Click a track in the timeline to edit properties." />
          )}
        </Card>

        <Card title="Library">
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {audioAssets.length === 0 ? (
              <EmptyState title="No assets" hint="No approved voice, sound, or music assets found." />
            ) : (
              audioAssets.map(asset => (
                <div key={asset.id} className="flex items-center justify-between p-2 border border-line rounded hover:bg-surface-2">
                  <div>
                    <p className="text-sm font-medium">{asset.name}</p>
                    <p className="text-xs text-ink-lo uppercase">{asset.kind} • {asset.durationSeconds?.toFixed(1) ?? '?'}s</p>
                  </div>
                  <Button variant="ghost" onClick={() => addTrack(asset)}>
                    Add
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TimelineLayer({
  name,
  tracks,
  assets,
  pps,
  selectedId,
  onSelect,
}: {
  name: string;
  tracks: AudioTrack[];
  assets: AssetRecord[];
  pps: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex border-b border-line pb-2">
      <div className="w-24 shrink-0 pt-1">
        <p className="text-xs font-semibold text-ink-mid uppercase tracking-wide">{name}</p>
      </div>
      <div className="relative flex-1 h-12 bg-surface-2 rounded overflow-hidden">
        {tracks.map(track => {
          const asset = assets.find(a => a.id === track.assetId);
          const isSelected = track.id === selectedId;
          const left = track.startTimeSeconds * pps;
          const width = track.durationSeconds * pps;

          return (
            <button
              key={track.id}
              onClick={() => onSelect(track.id)}
              className={`absolute top-1 h-10 rounded text-left overflow-hidden px-1 border shadow-sm transition-colors text-xs whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-surface-2
                ${isSelected ? 'border-primary ring-1 ring-primary z-10' : 'border-line hover:border-ink-lo'}
                ${track.muted ? 'bg-surface-3 text-ink-lo opacity-60' : 'bg-surface-0 text-ink-hi'}
              `}
              style={{ left, width: Math.max(width, 20) }}
              title={`${asset?.name || 'Unknown'} (${track.durationSeconds}s)`}
              aria-pressed={isSelected}
              aria-label={`${asset?.name || 'Unknown'} ${track.layer} track, starts at ${track.startTimeSeconds} seconds, duration ${track.durationSeconds} seconds, gain ${track.gainDb} decibels${track.muted ? ', muted' : ''}`}
            >
              <div className="font-medium truncate">{asset?.name || 'Unknown'}</div>
              <div className="opacity-75 truncate">{track.gainDb}dB {track.muted ? '(M)' : ''}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
