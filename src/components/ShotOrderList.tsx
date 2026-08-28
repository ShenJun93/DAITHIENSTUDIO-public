'use client';

/**
 * One scene's shots, reorderable by drag or by keyboard (Move up / Move
 * down — drag alone isn't keyboard-operable). A reorder is optimistic: the
 * row moves immediately, then reverts if the server call fails.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ActionResult } from '@/app/actions';
import type { CharacterRecord, ShotRecord } from '@/application/records';
import { Badge, StatusBadge } from './ui';

export function ShotOrderList({
  slug,
  sceneId,
  shots,
  characters,
  reorderAction,
}: {
  slug: string;
  sceneId: string;
  shots: ShotRecord[];
  characters: CharacterRecord[];
  reorderAction: (sceneId: string, shotIds: string[]) => Promise<ActionResult>;
}) {
  const [order, setOrder] = useState(shots);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const dragIndex = useRef<number | null>(null);

  const characterById = useMemo(() => new Map(characters.map((character) => [character.id, character])), [characters]);
  // Re-sync from the server only when the actual order changed underneath us
  // (e.g. another tab reordered this scene) — not on every parent re-render,
  // so an in-flight drag or a just-shown result message isn't discarded.
  const serverSignature = shots.map((shot) => shot.id).join('|');
  useEffect(() => {
    setOrder(shots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSignature]);

  const commit = (next: ShotRecord[]): void => {
    setOrder(next);
    setResult(null);
    setPending(true);
    reorderAction(sceneId, next.map((shot) => shot.id))
      .then((outcome) => {
        setResult(outcome);
        if (!outcome.ok) setOrder(shots);
      })
      .finally(() => setPending(false));
  };

  const move = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    commit(next);
  };

  const onDrop = (index: number): void => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(index, 0, item);
    commit(next);
  };

  return (
    <div className="overflow-x-auto">
      {result && (
        <p
          role="status"
          className={`px-3 pt-2 text-xs ${result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
        >
          <span aria-hidden="true">{result.ok ? '✓ ' : '✕ '}</span>
          {result.message}
          {result.code && !result.ok ? ` (${result.code})` : ''}
        </p>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-lo">
            <th className="w-16 px-2 py-2 font-medium">Order</th>
            <th className="px-2 py-2 font-medium">Code</th>
            <th className="px-2 py-2 font-medium">Size</th>
            <th className="px-2 py-2 font-medium">Camera</th>
            <th className="px-2 py-2 font-medium">Dur</th>
            <th className="px-2 py-2 font-medium">Cast (pinned)</th>
            <th className="px-2 py-2 font-medium">Props</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {order.map((shot, index) => (
            <tr
              key={shot.id}
              data-grid-item
              draggable
              aria-busy={pending}
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(index)}
              className={`border-b border-line/60 align-top ${pending ? 'opacity-60' : ''}`}
            >
              <td className="px-2 py-2">
                <div className="flex items-center gap-1">
                  <span aria-hidden="true" className="cursor-grab text-ink-lo" title="Drag to reorder">
                    ⠿
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={pending || index === 0}
                      aria-label={`Move ${shot.code} earlier in the scene`}
                      className="text-ink-mid hover:text-ink-hi disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={pending || index === order.length - 1}
                      aria-label={`Move ${shot.code} later in the scene`}
                      className="text-ink-mid hover:text-ink-hi disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </td>
              <td className="px-2 py-2 font-mono text-xs text-ink-lo">
                {shot.code}
                {shot.importance === 'key' && <span className="ml-1 text-amber-600 dark:text-amber-400">★</span>}
              </td>
              <td className="px-2 py-2 text-ink-mid">{shot.shotSize}</td>
              <td className="px-2 py-2 text-xs text-ink-mid">
                {shot.cameraAngle} · {shot.cameraMovement.speed} {shot.cameraMovement.type} · {shot.lens}
              </td>
              <td className="px-2 py-2 tabular-nums text-ink-mid">{shot.durationSeconds}s</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  {shot.characters.length === 0 ? (
                    <span className="text-xs text-ink-lo">—</span>
                  ) : (
                    shot.characters.map((ref) => (
                      <Badge key={`${shot.id}-${ref.characterId}`}>
                        {characterById.get(ref.characterId)?.name ?? ref.characterId.slice(0, 8)}
                        {ref.versionId ? ` ${ref.versionId}` : ' UNPINNED'}
                      </Badge>
                    ))
                  )}
                </div>
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  {shot.props.length === 0 ? (
                    <span className="text-xs text-ink-lo">—</span>
                  ) : (
                    shot.props.map((ref) => <Badge key={`${shot.id}-${ref.propId}`}>{ref.versionId || ref.propId.slice(0, 8)}</Badge>)
                  )}
                </div>
              </td>
              <td className="px-2 py-2">
                <StatusBadge status={shot.status} />
              </td>
              <td className="px-2 py-2 text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <Link href={`/projects/${slug}/shots/${shot.code}`} className="text-sm text-brand hover:underline">
                    Open
                  </Link>
                  <Link href={`/projects/${slug}/shots/${shot.code}/edit`} className="text-sm text-brand hover:underline">
                    Edit
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
