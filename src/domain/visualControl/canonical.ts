/**
 * Stable canonical serialization (VC1 — TASK-UI-VISUAL-CONTROL-001).
 *
 * `canonical()` turns any JSON-serializable value into a deterministic,
 * whitespace-free string that is identical for any two semantically
 * equivalent inputs, regardless of key insertion order or array order.
 *
 * Ordering rules (VISUAL-APPROVAL-CONTRACT.md §3):
 *   1. object keys are sorted lexicographically, at every nesting level
 *   2. arrays of primitives are sorted lexicographically
 *   3. arrays of objects are sorted by the canonical string of each element,
 *      unless `sortObjectArrays: false` is passed — the package-fingerprint
 *      builders pre-sort those arrays by their documented compound key and
 *      must preserve that order
 *   4. undefined object values are dropped; null is preserved; undefined
 *      inside an array is normalised to null
 *
 * No I/O, no randomness, no timestamps, no generated ids. Pure domain code.
 * The sha256 digest wrapper lives in the application layer because
 * `src/domain` must stay free of node builtins
 * (scripts/hooks/architecture-check.mjs, rule 01.1/06.13).
 */
export type ContentHash = (content: string) => string;

type JsonPrimitive = string | number | boolean | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function primitiveKey(value: JsonPrimitive): string {
  return value === null ? 'null' : JSON.stringify(value);
}

export interface CanonicalOptions {
  /**
   * When false, arrays of objects keep their given order — callers that pass
   * this guarantee a deterministic sort before serializing. Object keys and
   * primitive arrays are still normalised in both modes.
   */
  sortObjectArrays?: boolean;
}

function serialize(value: unknown, sortObjectArrays: boolean): string {
  if (value === null || typeof value !== 'object') {
    return value === undefined ? 'null' : JSON.stringify(value);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    const items = value.map((item) => (item === undefined ? null : item));
    const allPrimitives = items.every((item) => item === null || typeof item !== 'object');
    let ordered = items;
    if (allPrimitives) {
      ordered = [...items].sort((a, b) => primitiveKey(a as JsonPrimitive).localeCompare(primitiveKey(b as JsonPrimitive)));
    } else if (sortObjectArrays) {
      ordered = [...items].sort((a, b) => canonical(a, { sortObjectArrays: true }).localeCompare(canonical(b, { sortObjectArrays: true })));
    }
    return `[${ordered.map((item) => serialize(item, sortObjectArrays)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    const body = Object.keys(value)
      .sort()
      .map((key) => {
        const child = value[key];
        if (child === undefined) return '';
        return `${JSON.stringify(key)}:${serialize(child, sortObjectArrays)}`;
      })
      .filter(Boolean)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

export function canonical(value: unknown, options: CanonicalOptions = {}): string {
  return serialize(value, options.sortObjectArrays ?? true);
}
