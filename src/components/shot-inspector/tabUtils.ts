export const VALID_TABS = ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical'] as const;
export type TabValue = (typeof VALID_TABS)[number];

export const TAB_LABELS: Record<TabValue, string> = {
  overview: 'Overview',
  references: 'References',
  prompts: 'Prompts',
  'visual-control': 'Visual Control',
  generations: 'Generations',
  technical: 'Technical',
};

export function parseTab(input: string | undefined | null): TabValue {
  if (input && VALID_TABS.includes(input as TabValue)) {
    return input as TabValue;
  }
  return 'overview';
}

export function buildTabUrl(basePath: string, tab: TabValue): string {
  if (tab === 'overview') return basePath;
  return `${basePath}?tab=${tab}`;
}
