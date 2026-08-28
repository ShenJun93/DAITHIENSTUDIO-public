'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export type ProjectMode = 'guided' | 'advanced';
export type ProjectNavItem = { segment: string; label: string };
export type ProjectNavGroup = { label: string; items: ProjectNavItem[] };

export const PROJECT_MODE_PREFERENCE_KEY = 'daithienstudio.ui-preference.project-mode';

export function parseProjectModePreference(value: string | null): ProjectMode {
  return value === 'advanced' ? 'advanced' : 'guided';
}

export function visibleProjectNavGroups(
  groups: readonly ProjectNavGroup[],
  mode: ProjectMode,
): ProjectNavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => mode === 'advanced' || item.segment !== '/workflow'),
  }));
}

export function ProjectModeNavigation({
  slug,
  groups,
}: {
  slug: string;
  groups: readonly ProjectNavGroup[];
}) {
  const [mode, setMode] = useState<ProjectMode>('guided');

  useEffect(() => {
    try {
      setMode(parseProjectModePreference(window.localStorage.getItem(PROJECT_MODE_PREFERENCE_KEY)));
    } catch {
      setMode('guided');
    }
  }, []);

  function selectMode(nextMode: ProjectMode) {
    setMode(nextMode);
    try {
      window.localStorage.setItem(PROJECT_MODE_PREFERENCE_KEY, nextMode);
    } catch {
      // Browser storage is optional UI preference state; Guided remains the safe fallback.
    }
  }

  const visibleGroups = visibleProjectNavGroups(groups, mode);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-lo">Workspace mode</span>
        <div
          role="group"
          aria-label="Project workspace mode"
          className="inline-flex rounded-md border border-line bg-surface-1 p-0.5"
        >
          {(['guided', 'advanced'] as const).map((option) => {
            const selected = option === mode;
            const label = option === 'guided' ? 'Guided' : 'Advanced';
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => selectMode(option)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  selected
                    ? 'bg-surface-3 text-ink-hi'
                    : 'text-ink-mid hover:bg-surface-2 hover:text-ink-hi'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {visibleGroups.map((group) => (
          <div key={group.label} className="flex min-w-0 items-center gap-1">
            <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-ink-lo">
              {group.label}
            </span>
            {group.items.map((item) => (
              <Link
                key={item.label}
                href={`/projects/${slug}${item.segment}`}
                className="whitespace-nowrap rounded-md px-2 py-1 text-sm text-ink-mid hover:bg-surface-2 hover:text-ink-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
