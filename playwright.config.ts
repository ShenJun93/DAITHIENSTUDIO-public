import { defineConfig, devices } from '@playwright/test';

/**
 * SECONDARY / COMPLEMENTARY browser-evidence harness for the Safe Execution path
 * (Journey -> Ready -> Preflight -> Confirmation -> Enqueue), run offline against the
 * mock provider only. The PRIMARY, operator-accepted M1/M2/M3 evidence is
 * scripts/quality/m1-m3-browser-evidence.mjs (TASK-DAITHIEN-M1-M3-BROWSER-EVIDENCE-001,
 * PR #79) — this Playwright suite does not replace or compete with that acceptance; see
 * tests/e2e/README.md for exactly how the two relate.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1, not 0: cheap general-purpose safety net for genuine one-off transient failures.
  // Note: it is NOT effective against a stale process already holding port 3000 (see
  // "webServer" below and tests/e2e/README.md) — a retry within the same invocation
  // reuses that same broken server via reuseExistingServer, so it will not recover on
  // its own. If the suite stalls repeatedly, kill whatever holds port 3000 first.
  retries: 1,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { outputFolder: '.reports/browser-evidence/html', open: 'never' }]],
  outputDir: '.reports/browser-evidence/test-results',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Hard-force the mock provider regardless of any real credential present in the
      // developer's local .env — this harness must never risk real-provider spend.
      AI_IMAGE_PROVIDER: 'mock',
      AI_VIDEO_PROVIDER: 'mock',
      AI_TEXT_PROVIDER: 'mock',
      AI_VOICE_PROVIDER: 'mock',
      AI_MUSIC_PROVIDER: 'mock',
      AI_SOUND_PROVIDER: 'mock',
    },
  },
});
