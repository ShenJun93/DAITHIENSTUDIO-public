import { test, expect } from '@playwright/test';

/**
 * SECONDARY / COMPLEMENTARY browser evidence for the operator-visible Safe Execution
 * path — Journey -> Ready -> Preflight -> Confirmation -> Enqueue.
 *
 * This is NOT the primary evidence source for the M1/M2/M3 milestone claims. That is
 * scripts/quality/m1-m3-browser-evidence.mjs, operator-accepted and integrated via PR #79
 * (TASK-DAITHIEN-M1-M3-BROWSER-EVIDENCE-001). This suite is a second, independently
 * re-runnable check on the same operator-visible bridge using a different, widely-used
 * tool (Playwright) — kept because it is real, reviewed, working evidence, not because
 * it is required. See tests/e2e/README.md for the full relationship between the two.
 *
 * Run entirely offline against the mock provider (see playwright.config.ts
 * webServer.env). No real credential is used and no real spend can occur.
 *
 * Fixture: the seeded demo project "Trieu Ngoc - Tap Thu Nghiem"
 * (slug: trieu-ngoc-tap-thu-nghiem), shot EP01_SC01_SH001 - the same
 * identifiers already used throughout tests/integration and docs/examples.
 * Seed with `npm run db:seed` (idempotent - skips rebuild if already present)
 * before running this suite.
 *
 * The seed script does not assign a Production Type (a deliberate operator
 * decision in the real product, per docs/planning/PRODUCT_MILESTONES.md M1) -
 * without one, image/video generation capability resolution fails loudly with
 * PRODUCTION_TYPE_REQUIRED rather than silently degrading. This spec performs
 * that real operator step first, so the evidence covers both the Production
 * Type assignment (M1) and the Safe Execution bridge (M3) in one run.
 */

const PROJECT_SLUG = 'trieu-ngoc-tap-thu-nghiem';
const SHOT_CODE = 'EP01_SC01_SH001';
const PRODUCTION_TYPE_FIXTURE = 'animated-series';

test.describe('Safe Execution path (mock provider)', () => {
  test('Journey shows Ready, Preflight declares mock/zero-credit, and Confirm enqueues an image generation', async ({
    page,
  }) => {
    // ---- Journey -> Ready -------------------------------------------------
    await test.step('Journey home renders the phase strip', async () => {
      await page.goto(`/projects/${PROJECT_SLUG}`);
      await expect(page.getByRole('heading', { name: 'Production journey' })).toBeVisible();
      await expect(page.getByLabel('Production journey phases')).toBeVisible();
    });

    // ---- Production Type (M1 precondition for generation capability) ------
    await test.step('Assign a Production Type when the project does not already have one', async () => {
      const typeSelect = page.getByLabel('Current Type');
      // exact: true matters here — Playwright's default accessible-name match is a
      // case-insensitive substring, and "Change" is a substring of the confirmation
      // card's "Confirm change" button. Without it, this locator silently re-resolves
      // to the wrong button once the confirmation card replaces the plain control.
      const changeButton = page.getByRole('button', { name: 'Change', exact: true });

      // Read BEFORE any interaction: at fresh load, the <select>'s value is initialized
      // straight from the server-provided `currentType` prop, so it is reliable evidence
      // here. It stops being reliable the instant an option is picked — React updates the
      // local `targetType` state (and the select's displayed value) immediately, before
      // any server round-trip.
      const alreadyAssigned = await typeSelect.inputValue();
      if (alreadyAssigned) return;

      await typeSelect.selectOption(PRODUCTION_TYPE_FIXTURE);
      await changeButton.click();

      // Assigning a type onto a project that already has production data (the seeded
      // demo does) requires an explicit confirmation step — this is real product
      // behavior (ProjectProductionTypeControl's CONFIRMATION_REQUIRED branch), not
      // an edge case to route around. `.isVisible()` alone is a one-shot check, not a
      // poll — it can fire before React finishes rendering the confirmation card and
      // silently skip the click, so use `expect().toBeVisible()` (which retries) to
      // find out whether confirmation is actually required.
      const confirmChange = page.getByRole('button', { name: 'Confirm change', exact: true });
      try {
        // 15s: this is a comparable Server-Action round trip to the ones elsewhere in
        // this file — see production-type-and-journey.spec.ts for the file where this
        // exact action's first-hit variance is budgeted more generously, since that
        // spec runs first alphabetically and hits it cold.
        await expect(confirmChange).toBeVisible({ timeout: 15_000 });
        await confirmChange.click();
      } catch {
        // Confirmation was not required — the plain Change click alone was sufficient.
      }

      await expect(changeButton).toBeDisabled({ timeout: 15_000 });
    });

    // ---- Preflight ----------------------------------------------------------
    await test.step('Preflight declares the mock provider as offline/zero-credit', async () => {
      await page.goto(`/projects/${PROJECT_SLUG}/shots/${SHOT_CODE}?tab=prompts`);
      await expect(page.getByRole('tab', { name: 'Prompts', exact: false })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByRole('heading', { name: 'Preflight readiness' })).toBeVisible();

      const imagePreflight = page.locator('section[aria-label="Image generation preflight"]');
      await expect(imagePreflight).toBeVisible();
      await expect(imagePreflight).toContainText('OFFLINE / ZERO-CREDIT');
    });

    // ---- Confirmation -> Enqueue -------------------------------------------
    await test.step('Prepare then confirm image generation enqueues (or idempotently reuses) a job', async () => {
      await page.goto(`/projects/${PROJECT_SLUG}/shots/${SHOT_CODE}?tab=generations`);
      await expect(page.getByRole('tab', { name: 'Generations', exact: false })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      const imageConfirmation = page.locator('section[aria-label="Image generation confirmation"]');
      await expect(imageConfirmation).toBeVisible();

      // No pre-check for an already-enqueued state here: ImageGenerationConfirmation
      // always mounts with phase 'IDLE' (initialImageExecutionConfirmationState) and
      // never fetches prior generation state on load, so on a fresh page.goto the
      // 'ENQUEUED' view can never be showing yet — that branch would be unreachable
      // dead code. Idempotent reuse on a second run is still exercised for real: the
      // confirm step below still calls Prepare + Confirm, and the server-side
      // idempotency guarantee is what returns 'Already queued' instead of duplicating
      // the job (asserted after the click, not before).
      await imageConfirmation.getByRole('button', { name: 'Prepare image' }).click();

      const reviewOrError = imageConfirmation.getByRole('button', { name: 'Confirm image generation' })
        .or(imageConfirmation.getByRole('alert'));
      await expect(reviewOrError).toBeVisible({ timeout: 15_000 });

      const confirmButton = imageConfirmation.getByRole('button', { name: 'Confirm image generation' });
      if (!(await confirmButton.isVisible().catch(() => false))) {
        // A declared capability mismatch or provider-unavailable preflight state is
        // itself valid evidence the bridge fails loudly rather than silently -
        // surface the exact reason instead of asserting a specific happy path.
        const alertText = await imageConfirmation.getByRole('alert').innerText();
        throw new Error(`Prepare did not reach a confirmable state: ${alertText}`);
      }

      await confirmButton.click();
      await expect(
        imageConfirmation.getByText(/^(Image queued|Already queued)$/),
      ).toBeVisible({ timeout: 15_000 });
      // Match the generation id by its shape (a single token, no whitespace) rather
      // than the incidental `font-mono` Tailwind class it happens to be styled with —
      // a style refactor should not be able to break this assertion.
      await expect(imageConfirmation.getByText(/^[A-Za-z0-9_-]{6,}$/)).toBeVisible();
    });
  });
});
