import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const globals = readFileSync('src/app/globals.css', 'utf8');
const tailwindConfig = readFileSync('tailwind.config.ts', 'utf8');

const SEMANTIC_ROLES = ['success', 'warning', 'destructive', 'info', 'blocked'] as const;

function themeSection(css: string, theme: 'root' | 'dark'): string {
  const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
  const darkBlock = /\.dark\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
  return theme === 'root' ? rootBlock : darkBlock;
}

describe('design tokens', () => {
  it('defines every semantic status colour, with a soft variant, in both themes', () => {
    for (const theme of ['root', 'dark'] as const) {
      const section = themeSection(globals, theme);
      for (const role of SEMANTIC_ROLES) {
        expect(section, `${theme} missing --${role}`).toMatch(new RegExp(`--${role}:\\s*\\S+;`));
        expect(section, `${theme} missing --${role}-soft`).toMatch(new RegExp(`--${role}-soft:\\s*\\S+;`));
      }
      expect(section, `${theme} missing --focus`).toMatch(/--focus:\s*var\(--brand\);/);
    }
  });

  it('never redeclares --brand-soft with an invalid value before the real one', () => {
    expect(globals).not.toContain('#1e3purple');
    const darkBlock = themeSection(globals, 'dark');
    const brandSoftMatches = darkBlock.match(/--brand-soft:/g) ?? [];
    expect(brandSoftMatches).toHaveLength(1);
  });

  it('defines the motion duration and easing tokens once, theme-independent', () => {
    const rootBlock = themeSection(globals, 'root');
    expect(rootBlock).toMatch(/--motion-fast:\s*120ms;/);
    expect(rootBlock).toMatch(/--motion-base:\s*200ms;/);
    expect(rootBlock).toMatch(/--motion-slow:\s*300ms;/);
    expect(rootBlock).toContain('--motion-ease:');
  });

  it('collapses animation and transition duration under prefers-reduced-motion', () => {
    expect(globals).toMatch(/prefers-reduced-motion:\s*reduce/);
    const reducedMotionBlock = /prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(globals)?.[1] ?? '';
    expect(reducedMotionBlock).toContain('animation-duration: 0.001ms !important');
    expect(reducedMotionBlock).toContain('transition-duration: 0.001ms !important');
  });

  it('exposes every semantic colour role and the motion tokens through Tailwind', () => {
    for (const role of SEMANTIC_ROLES) {
      expect(tailwindConfig).toMatch(new RegExp(`${role}:\\s*\\{\\s*DEFAULT:\\s*'var\\(--${role}\\)'`));
    }
    expect(tailwindConfig).toContain("focus: 'var(--focus)'");
    expect(tailwindConfig).toContain("fast: 'var(--motion-fast)'");
    expect(tailwindConfig).toContain("base: 'var(--motion-base)'");
    expect(tailwindConfig).toContain("slow: 'var(--motion-slow)'");
    expect(tailwindConfig).toContain("standard: 'var(--motion-ease)'");
  });

  it('does not remove or rename the existing surface/ink/line/brand tokens the app already depends on', () => {
    for (const theme of ['root', 'dark'] as const) {
      const section = themeSection(globals, theme);
      for (const existing of ['--surface-0', '--surface-1', '--surface-2', '--surface-3', '--ink-hi', '--ink-mid', '--ink-lo', '--line', '--brand', '--brand-soft']) {
        expect(section, `${theme} missing ${existing}`).toMatch(new RegExp(`${existing}:\\s*\\S`));
      }
    }
  });
});
