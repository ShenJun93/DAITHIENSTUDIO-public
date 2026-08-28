/**
 * Sequencing a project's shots across scenes for the timeline, the EDL/SRT
 * exports and the shot-list/voice-script exports (TASK-005).
 *
 * A shot's position is `(scene.number, shot.sortIndex, shot.shotNumber)`.
 * `sortIndex` is the storyboard drag order within its scene; `shotNumber` is
 * the tiebreak, which is what every one of these ordered a shot by before
 * `sortIndex` existed — so a scene nobody has reordered yet sorts exactly as
 * it always did.
 *
 * Typed structurally rather than against `ShotRecord`/`SceneRecord` so this
 * stays importable from the application layer without domain reaching up to
 * `@/application/records`.
 */

export interface OrderableShot {
  sceneId: string;
  sortIndex: number;
  shotNumber: number;
}

export interface OrderableScene {
  id: string;
  number: number;
}

export function sortShotsForSequence<S extends OrderableShot>(shotList: readonly S[], sceneList: readonly OrderableScene[]): S[] {
  const sceneOrder = new Map(sceneList.map((scene) => [scene.id, scene.number]));

  return [...shotList].sort((a, b) => {
    const left = sceneOrder.get(a.sceneId) ?? Number.MAX_SAFE_INTEGER;
    const right = sceneOrder.get(b.sceneId) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
    return a.shotNumber - b.shotNumber;
  });
}
