import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnimatedMetric } from '@/components/motion/AnimatedMetric';
import { LoadingShimmer } from '@/components/motion/LoadingShimmer';
import { ProgressTransition } from '@/components/motion/ProgressTransition';
import { SectionReveal } from '@/components/motion/SectionReveal';
import { StatusPulse } from '@/components/motion/StatusPulse';

Object.assign(globalThis, { React });

describe('motion wrappers (src/components/motion/**)', () => {
  it('SectionReveal wraps children in a single bounded reveal animation, not an infinite one', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SectionReveal, { children: React.createElement('p', null, 'content') }),
    );
    expect(markup).toContain('animate-section-reveal');
    expect(markup).toContain('content');
  });

  it('LoadingShimmer announces the loading state and renders one skeleton per requested line', () => {
    const markup = renderToStaticMarkup(React.createElement(LoadingShimmer, { lines: 2 }));
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Loading"');
    expect(markup.match(/animate-pulse/g)?.length).toBe(2);
  });

  it('StatusPulse always pairs the pulsing dot with a required text label', () => {
    const markup = renderToStaticMarkup(React.createElement(StatusPulse, { label: 'Generating shot preview', tone: 'info' }));
    expect(markup).toContain('Generating shot preview');
    expect(markup).toContain('bg-info');
    // the dot itself is decorative; the label carries the accessible meaning
    expect(markup).toContain('aria-hidden="true"');
  });

  it('AnimatedMetric renders the value plainly so it is always readable without the animation', () => {
    const markup = renderToStaticMarkup(React.createElement(AnimatedMetric, { value: '12 / 16' }));
    expect(markup).toContain('12 / 16');
    expect(markup).toContain('animate-metric-in');
  });

  it('ProgressTransition renders the percentage as text and a semantic progressbar, never colour/width alone', () => {
    const markup = renderToStaticMarkup(React.createElement(ProgressTransition, { percent: 62.4, label: 'Rendering timeline' }));
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="62"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain('62%');
    expect(markup).toContain('Rendering timeline');
  });

  it('ProgressTransition clamps out-of-range percentages instead of producing an invalid bar', () => {
    const over = renderToStaticMarkup(React.createElement(ProgressTransition, { percent: 140, label: 'x' }));
    expect(over).toContain('aria-valuenow="100"');
    const under = renderToStaticMarkup(React.createElement(ProgressTransition, { percent: -20, label: 'x' }));
    expect(under).toContain('aria-valuenow="0"');
  });
});
