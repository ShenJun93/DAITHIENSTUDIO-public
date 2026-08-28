import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        ink: {
          hi: 'var(--ink-hi)',
          mid: 'var(--ink-mid)',
          lo: 'var(--ink-lo)',
        },
        line: 'var(--line)',
        brand: {
          DEFAULT: 'var(--brand)',
          soft: 'var(--brand-soft)',
        },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        destructive: { DEFAULT: 'var(--destructive)', soft: 'var(--destructive-soft)' },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        blocked: { DEFAULT: 'var(--blocked)', soft: 'var(--blocked-soft)' },
        focus: 'var(--focus)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--motion-ease)',
      },
    },
  },
  plugins: [],
};

export default config;
