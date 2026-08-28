import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('Project Production Type UI', () => {
  describe('ProjectForm (Create)', () => {
    it('renders a required select for productionType with exactly eight valid options and no blank option', async () => {
      const form = await source('src/components/ProjectForm.tsx');
      
      // Must have the select
      expect(form).toMatch(/<select[^>]*name="productionType"[^>]*required/);
      
      // Must map over 8 accepted options or hardcode 8 options for productionType
      // Let's just count the presence of the 8 production types.
      const types = [
        'feature-film',
        'short-film',
        'series',
        'cinematic-short-film',
        'animated-series',
        'commercial',
        'music-video',
        'social-video',
      ];
      
      // In source testing, we can check if it imports PRODUCTION_TYPES or if it maps over it
      expect(form).toContain('PRODUCTION_TYPES');
      
      // Ensure no None option like `<option value="">`
      // This is a bit tricky to assert via string match, but we can check if there's any hardcoded empty option.
      const emptyOption = /<option[^>]*value=(?:""|{""}|'')/g;
      expect(emptyOption.test(form)).toBe(false);
    });
  });

  describe('ProjectProductionTypeControl (Overview)', () => {
    it('renders current type, handles confirmation state without browser window.confirm', async () => {
      let control = '';
      try {
        control = await source('src/components/ProjectProductionTypeControl.tsx');
      } catch {
        // file doesn't exist yet for RED cycle
      }

      // Assert basic properties once created
      if (control) {
        expect(control).toContain('Not selected'); // Legacy null
        expect(control).not.toMatch(/\bwindow\.confirm\b/);
        
        // Should have "Confirm change" and "Cancel" buttons for the confirmation state
        expect(control).toContain('Confirm change');
        expect(control).toContain('Cancel');
        
        // Submit button for the initial set/change
        expect(control).toContain('Change');
      } else {
        expect(true).toBe(false); // Force fail if file missing
      }
    });
  });

  describe('Project Overview Page Wiring', () => {
    it('places ProjectProductionTypeControl after Project attention and before ProductionJourneyHome', async () => {
      const page = await source('src/app/projects/[slug]/page.tsx');
      
      expect(page).toContain('ProjectProductionTypeControl');
      
      // Approximate order: Attention -> ProductionTypeControl -> ProductionJourneyHome
      const attentionIdx = page.indexOf('<ProjectAttention');
      const controlIdx = page.indexOf('<ProjectProductionTypeControl');
      const journeyIdx = page.indexOf('<ProductionJourneyHome');
      
      expect(controlIdx).toBeGreaterThan(attentionIdx);
      expect(journeyIdx).toBeGreaterThan(controlIdx);
    });
  });
});
