import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cn } from '@/components/ui/cn';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

Object.assign(globalThis, { React });

describe('shadcn-style primitives (src/components/ui/**)', () => {
  it('cn merges class names and drops falsy values', () => {
    expect(cn('a', false, undefined, 'b', null)).toBe('a b');
  });

  it('Skeleton renders a decorative, reduced-motion-safe placeholder', () => {
    const markup = renderToStaticMarkup(React.createElement(Skeleton, { className: 'h-3 w-1/3' }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('animate-pulse');
    expect(markup).toContain('h-3 w-1/3');
  });

  it('Separator exposes an explicit orientation for assistive technology', () => {
    const horizontal = renderToStaticMarkup(React.createElement(Separator, {}));
    expect(horizontal).toContain('role="separator"');
    expect(horizontal).toContain('aria-orientation="horizontal"');

    const vertical = renderToStaticMarkup(React.createElement(Separator, { orientation: 'vertical' }));
    expect(vertical).toContain('aria-orientation="vertical"');
  });
});
