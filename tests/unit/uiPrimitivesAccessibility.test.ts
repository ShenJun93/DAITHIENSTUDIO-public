import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function hexToLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255) ?? [];
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(hexToLuminance(first), hexToLuminance(second));
  const darker = Math.min(hexToLuminance(first), hexToLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function cssVariable(section: string, name: string): string {
  const value = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(section)?.[1];
  if (!value) throw new Error(`Missing CSS variable ${name}`);
  return value;
}

describe('UI Primitives accessibility', () => {
  it('keeps form and selector controls labelled with announced async states', async () => {
    const [episode, createEpisode] = await Promise.all([
      source('src/components/EpisodeSelector.tsx'),
      source('src/components/CreateEpisodeForm.tsx'),
    ]);

    expect(episode).toContain('htmlFor="episode-selector"');
    expect(episode).toContain('aria-describedby={isPending || result');
    // CreateEpisodeForm.tsx was migrated onto the shared form primitives
    // (TASK-UI-CORE-EDITORS-001 Episode UI migration): the title input is
    // labelled via the shared Field component's implicit label/input
    // nesting (id "field-title", matching every other migrated form's
    // naming convention) rather than an explicit htmlFor pairing, and its
    // async states are announced by the shared primitives themselves —
    // SaveBar's role="status" for the success message, Notice's
    // role="status" for a non-field failure, and ValidationSummary/
    // FieldError's role="alert" for a field-specific one — instead of one
    // inline ternary role attribute.
    expect(createEpisode).toContain('id="field-title"');
    expect(createEpisode).toContain('name="title"');
    expect(createEpisode).toContain('required');
    expect(createEpisode).toContain("import { SaveBar } from '@/components/ui/saveBar'");
    expect(createEpisode).toContain("import { FieldError, ValidationSummary } from '@/components/ui/validationSummary'");
  });

  it('keeps primary button contrast at WCAG AA in both themes', async () => {
    const [globals, ui] = await Promise.all([
      source('src/app/globals.css'),
      source('src/components/ui.tsx'),
    ]);
    const light = globals.split('.dark')[0] ?? '';
    const dark = globals.split('.dark')[1]?.split('}')[0] ?? '';

    expect(ui).toContain("primary: 'bg-brand text-surface-0");
    expect(contrastRatio(cssVariable(light, '--brand'), cssVariable(light, '--surface-0'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(cssVariable(dark, '--brand'), cssVariable(dark, '--surface-0'))).toBeGreaterThanOrEqual(4.5);
  });
});
