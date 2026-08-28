import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TechnicalContent } from '@/components/shot-inspector/TechnicalContent';
import technicalSource from '@/components/shot-inspector/TechnicalContent.tsx?raw';
import disclosureSource from '@/components/shot-inspector/TechnicalDisclosure.tsx?raw';
import copySource from '@/components/shot-inspector/CopyAuditValue.tsx?raw';

Object.assign(globalThis, { React });

describe('Shot Inspector IA7 — technical audit presentation', () => {
  const props = {
    continuityIn: { note: 'entering', environment: { weather: 'rain' } },
    continuityOut: { note: 'leaving', environment: { weather: 'clear' } },
    findings: [
      {
        severity: 'warning',
        rule: 'continuity-costume',
        message: 'Costume differs across the cut',
        field: 'costume',
        expected: 'red',
        actual: 'blue',
        classification: 'CROSS_CUT',
      },
    ],
    packageFingerprint: 'package-fingerprint-123',
    continuityFingerprint: 'continuity-fingerprint-456',
    prompts: [
      { kind: 'image' as const, promptId: 'prompt-image-1', version: 3, lockRefs: { character: 'char-v2' } },
      { kind: 'video' as const, promptId: 'prompt-video-1', version: 2, lockRefs: { location: 'loc-v1' } },
    ],
    decisionRule: { code: '4', message: 'Continuity blocker: Costume differs across the cut' },
    assets: [{ id: 'asset-1', name: 'frame.png', lineageHref: '/projects/demo/assets?focus=asset-1' }],
  };

  it('Technical evidence is consolidated behind progressive disclosure', () => {
    const html = renderToStaticMarkup(React.createElement(TechnicalContent, props));

    expect(html).toContain('Fingerprints');
    expect(html).toContain('package-fingerprint-123');
    expect(html).toContain('continuity-fingerprint-456');
    expect(html).toContain('Continuity environment');
    expect(html).toContain('continuity-costume');
    expect(html).toContain('CROSS_CUT');
    expect(html).toContain('prompt-image-1');
    expect(html).toContain('char-v2');
    expect(html).toContain('Current decision / blocker rule');
    expect(html).toContain('/projects/demo/assets?focus=asset-1');
    expect((html.match(/<details/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(html).not.toContain('<details open');
  });

  it('Technical audit interactions are read only', () => {
    expect(disclosureSource).toContain('<details');
    expect(disclosureSource).not.toContain('open=');
    expect(copySource).toContain("'use client'");
    expect(copySource).toContain('navigator.clipboard.writeText(value)');
    expect(copySource).not.toContain('fetch(');
    expect(copySource).not.toContain('<form');
    expect(technicalSource).not.toContain('ActionButton');
    expect(technicalSource).not.toContain('ServerAction');
    expect(technicalSource).not.toContain('enqueueGeneration');
    expect(technicalSource).not.toContain('decideAssetAction');
    expect(technicalSource).not.toContain('fetch(');
    expect(technicalSource).not.toContain('<form');
  });

  it('CopyAuditValue shows a distinct failure state when clipboard write rejects', () => {
    // No jsdom in this suite's vitest environment (environment: 'node'), so
    // interaction is verified at the source level, matching this file's
    // existing convention for CopyAuditValue above — real click/DOM behavior
    // is covered separately by manual browser verification (see task handoff).
    expect(copySource).toContain('try {');
    expect(copySource).toContain('catch');
    expect(copySource).toContain('setFailed(true)');
    expect(copySource).toContain('Failed to copy');
    expect(copySource).toContain('setFailed(false)');
    // aria-label must reflect the failed state too, not just visible text/colour —
    // otherwise screen-reader users never hear the failure feedback sighted users see.
    expect(copySource).toContain('Failed to copy ${label}');
  });
});
