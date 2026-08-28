import clsx, { type ClassValue } from 'clsx';

/**
 * Shared class-name merge helper for the shadcn-style primitives in this
 * directory. Deliberately just `clsx` — see docs/design/COMPONENT-GUIDELINES.md
 * for why `tailwind-merge`/`class-variance-authority` were not added.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
