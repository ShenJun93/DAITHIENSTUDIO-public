'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { VALID_TABS, TAB_LABELS, type TabValue } from './tabUtils';

export { VALID_TABS, TAB_LABELS, parseTab, buildTabUrl, type TabValue } from './tabUtils';

export interface ShotInspectorTabsProps {
  activeTab: TabValue;
}

export function ShotInspectorTabs({ activeTab }: ShotInspectorTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [clientTab, setClientTab] = useState<TabValue>(activeTab);

  useEffect(() => {
    setClientTab(activeTab);
  }, [activeTab]);

  const navigateToTab = useCallback(
    (tab: TabValue) => {
      setClientTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      router.replace(url, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!clientTab) return;
      const currentIndex = VALID_TABS.indexOf(clientTab);
      if (currentIndex < 0) return;
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          nextIndex = currentIndex > 0 ? currentIndex - 1 : VALID_TABS.length - 1;
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextIndex = currentIndex < VALID_TABS.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = VALID_TABS.length - 1;
          break;
        default:
          return;
      }

      const nextTab = VALID_TABS[nextIndex];
      if (!nextTab) return;
      navigateToTab(nextTab);

      requestAnimationFrame(() => {
        const nextButton = tabListRef.current?.querySelector<HTMLButtonElement>(
          `[data-tab="${nextTab}"]`,
        );
        nextButton?.focus();
      });
    },
    [clientTab, navigateToTab],
  );

  useEffect(() => {
    const activeButton = tabListRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab="${clientTab}"]`,
    );
    activeButton?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [clientTab]);

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label="Shot Inspector sections"
      className="flex gap-0 overflow-x-auto border-b border-line"
      onKeyDown={handleKeyDown}
    >
      {VALID_TABS.map((tab) => {
        const isActive = tab === clientTab;
        return (
          <button
            key={tab}
            data-tab={tab}
            role="tab"
            type="button"
            aria-selected={isActive ? 'true' : 'false'}
            aria-controls={`shot-tabpanel-${tab}`}
            id={`shot-tab-${tab}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => navigateToTab(tab)}
            className={`flex-shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${
              isActive
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-mid hover:border-line hover:text-ink-hi'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}
