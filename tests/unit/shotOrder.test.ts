import { describe, expect, it } from 'vitest';
import { sortShotsForSequence, type OrderableScene, type OrderableShot } from '@/domain/shotOrder';

const scenes: OrderableScene[] = [
  { id: 'sc_1', number: 1 },
  { id: 'sc_2', number: 2 },
];

describe('shot order', () => {
  it('Orders shots by scene number, then by sortIndex, then by shot number', () => {
    const shots: (OrderableShot & { id: string })[] = [
      { id: 'a', sceneId: 'sc_2', sortIndex: 0, shotNumber: 1 },
      { id: 'b', sceneId: 'sc_1', sortIndex: 20, shotNumber: 2 },
      { id: 'c', sceneId: 'sc_1', sortIndex: 10, shotNumber: 1 },
    ];

    const ordered = sortShotsForSequence(shots, scenes);

    expect(ordered.map((shot) => shot.id)).toEqual(['c', 'b', 'a']);
  });

  it('Falls back to shot number when sortIndex is tied', () => {
    const shots: (OrderableShot & { id: string })[] = [
      { id: 'later', sceneId: 'sc_1', sortIndex: 0, shotNumber: 2 },
      { id: 'earlier', sceneId: 'sc_1', sortIndex: 0, shotNumber: 1 },
    ];

    const ordered = sortShotsForSequence(shots, scenes);

    expect(ordered.map((shot) => shot.id)).toEqual(['earlier', 'later']);
  });

  it('Does not mutate the input array', () => {
    const shots: (OrderableShot & { id: string })[] = [
      { id: 'a', sceneId: 'sc_1', sortIndex: 20, shotNumber: 2 },
      { id: 'b', sceneId: 'sc_1', sortIndex: 10, shotNumber: 1 },
    ];
    const original = [...shots];

    sortShotsForSequence(shots, scenes);

    expect(shots).toEqual(original);
  });
});
