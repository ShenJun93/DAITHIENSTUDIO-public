import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BROWSER_BASE_URL ?? 'http://127.0.0.1:3100';
const evidenceDir = path.resolve('artifacts/browser-evidence');
const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
const fixture = path.resolve('scripts/quality/m1-m3-browser-evidence-fixture.ts');

mkdirSync(evidenceDir, { recursive: true });

function outputValue(output, key) {
  const match = output.match(new RegExp(`${key}=([^\r\n]+)`));
  assert.ok(match, `fixture output did not expose ${key}: ${output}`);
  return match[1].trim();
}

async function visible(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  assert.ok(await locator.isVisible(), `${label} is not visible`);
}

async function noHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.viewport + 1,
    `horizontal overflow: viewport=${dimensions.viewport}, scrollWidth=${dimensions.scrollWidth}`,
  );
}

function cardWithHeading(page, name) {
  return page.locator('section').filter({
    has: page.getByRole('heading', { name, exact: true }),
  }).first();
}

async function waitForChangeIdle(page) {
  const changeButton = page.getByRole('button', { name: 'Change', exact: true });
  await visible(changeButton, 'Production Type Change button after mutation');
  await page.waitForTimeout(100);
}

async function runM1(page, legacySlug, reassignmentSlug, expectedFormat) {
  console.log('[browser-evidence] M1: product-facing create requires Production Type...');
  await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle' });

  const createCard = cardWithHeading(page, 'New project');
  await visible(createCard, 'New project card');
  const productionTypeSelect = createCard.locator('select[name="productionType"]');
  await visible(productionTypeSelect, 'Create Project Production Type select');
  assert.equal(await productionTypeSelect.getAttribute('required'), '', 'Production Type select must be required');
  const productionTypeOptions = await productionTypeSelect.locator('option').evaluateAll((options) =>
    options.map((option) => ({ value: option.value, text: option.textContent?.trim() ?? '' })),
  );
  assert.ok(productionTypeOptions.length >= 8, `expected accepted Production Type options, found ${productionTypeOptions.length}`);
  assert.ok(productionTypeOptions.every((option) => option.value.length > 0), 'product-facing create must not expose an untyped Production Type option');
  await visible(createCard.locator('select[name="format"]'), 'independent Create Project Format select');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: path.join(evidenceDir, 'm1-create-production-type-required-1440.png'), fullPage: true });

  console.log('[browser-evidence] M1: legacy/null project set and clear...');
  await page.goto(`${baseUrl}/projects/${legacySlug}`, { waitUntil: 'networkidle' });
  let typeCard = cardWithHeading(page, 'Production Type');
  await visible(typeCard, 'legacy Production Type card');
  let typeSelect = typeCard.locator('select');
  assert.equal(await typeSelect.inputValue(), '', 'legacy project must render with no selected Production Type');

  await typeSelect.selectOption('motion-comic');
  await typeCard.getByRole('button', { name: 'Change', exact: true }).click();
  await waitForChangeIdle(page);
  await page.reload({ waitUntil: 'networkidle' });
  typeCard = cardWithHeading(page, 'Production Type');
  typeSelect = typeCard.locator('select');
  assert.equal(await typeSelect.inputValue(), 'motion-comic', 'legacy project must persist Production Type set through UI');
  await page.screenshot({ path: path.join(evidenceDir, 'm1-legacy-production-type-set-1440.png'), fullPage: true });

  await typeSelect.selectOption('');
  await typeCard.getByRole('button', { name: 'Change', exact: true }).click();
  await waitForChangeIdle(page);
  await page.reload({ waitUntil: 'networkidle' });
  typeCard = cardWithHeading(page, 'Production Type');
  typeSelect = typeCard.locator('select');
  assert.equal(await typeSelect.inputValue(), '', 'legacy project must persist Production Type clear through UI');
  await page.screenshot({ path: path.join(evidenceDir, 'm1-legacy-production-type-cleared-1440.png'), fullPage: true });

  console.log('[browser-evidence] M1: confirmation-gated reassignment and Format independence...');
  await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle' });
  let projectRow = page.getByRole('row').filter({ hasText: reassignmentSlug }).first();
  await visible(projectRow, 'reassignment project row before change');
  assert.equal((await projectRow.locator('td').nth(2).textContent())?.trim(), expectedFormat, 'rendered Format before reassignment must match fixture');

  await page.goto(`${baseUrl}/projects/${reassignmentSlug}`, { waitUntil: 'networkidle' });
  typeCard = cardWithHeading(page, 'Production Type');
  typeSelect = typeCard.locator('select');
  assert.equal(await typeSelect.inputValue(), 'motion-comic', 'reassignment fixture must start as motion-comic');
  await typeSelect.selectOption('cinematic-short-film');
  await typeCard.getByRole('button', { name: 'Change', exact: true }).click();

  let confirmCard = cardWithHeading(page, 'Confirm Production Type Change');
  await visible(confirmCard, 'confirmation-gated Production Type reassignment card');
  await visible(confirmCard.getByText(/WARNING: Changing the production type/i), 'reassignment warning');
  await visible(confirmCard.getByRole('button', { name: 'Confirm change', exact: true }), 'Confirm change button');
  await visible(confirmCard.getByRole('button', { name: 'Cancel', exact: true }), 'Cancel reassignment button');
  await page.screenshot({ path: path.join(evidenceDir, 'm1-reassignment-confirmation-required-1440.png'), fullPage: true });

  await confirmCard.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  typeCard = cardWithHeading(page, 'Production Type');
  typeSelect = typeCard.locator('select');
  assert.equal(await typeSelect.inputValue(), 'motion-comic', 'cancelled reassignment must not mutate Production Type');

  await typeSelect.selectOption('cinematic-short-film');
  await typeCard.getByRole('button', { name: 'Change', exact: true }).click();
  confirmCard = cardWithHeading(page, 'Confirm Production Type Change');
  await visible(confirmCard, 'confirmation card before confirmed reassignment');
  await confirmCard.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await visible(cardWithHeading(page, 'Production Type'), 'Production Type card after confirmed reassignment');
  await page.reload({ waitUntil: 'networkidle' });
  typeCard = cardWithHeading(page, 'Production Type');
  typeSelect = typeCard.locator('select');
  assert.equal(await typeSelect.inputValue(), 'cinematic-short-film', 'confirmed reassignment must persist new Production Type');

  await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle' });
  projectRow = page.getByRole('row').filter({ hasText: reassignmentSlug }).first();
  await visible(projectRow, 'reassignment project row after change');
  assert.equal((await projectRow.locator('td').nth(2).textContent())?.trim(), expectedFormat, 'rendered Project.format must remain unchanged after Production Type reassignment');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: path.join(evidenceDir, 'm1-reassignment-confirmed-format-independent-1440.png'), fullPage: true });
  console.log('[browser-evidence] M1 PASS.');
}

async function runM2(page, projectSlug) {
  console.log('[browser-evidence] M2: rendered Journey state...');
  await page.goto(`${baseUrl}/projects/${projectSlug}`, { waitUntil: 'networkidle' });

  const phaseStrip = page.locator('ol[aria-label="Production journey phases"]');
  await visible(phaseStrip, 'Production Journey phase strip');
  await visible(phaseStrip.getByText('Current phase', { exact: true }), 'current Journey phase badge');

  const attention = page.locator('section[aria-labelledby="project-attention-title"]');
  await visible(attention, 'Project attention section');
  const actionHeading = attention.locator('h2');
  await visible(actionHeading, 'operator-visible Journey next action');
  assert.ok((await actionHeading.textContent())?.trim(), 'Journey next action label must be non-empty');

  const reason = attention.locator('p').nth(1);
  await visible(reason, 'operator-visible Journey reason');
  assert.ok((await reason.textContent())?.trim(), 'Journey reason must be non-empty');
  await visible(attention.getByText(/blocker/i).first(), 'Journey blocker count');
  await visible(attention.locator('a[href]').first(), 'Journey concrete next-action link');

  const productionPath = cardWithHeading(page, 'Production path');
  await visible(productionPath, 'Production path summary');
  await visible(productionPath.getByText('motion-comic', { exact: true }), 'Production Type in production path');

  await noHorizontalOverflow(page);
  await page.screenshot({ path: path.join(evidenceDir, 'm2-journey-current-reason-next-action-1440.png'), fullPage: true });
  console.log('[browser-evidence] M2 PASS.');
}

async function runM3(page, projectSlug, shotCode) {
  console.log('[browser-evidence] M3: Journey -> Ready -> Preflight -> Confirmation -> Enqueue...');

  await page.goto(`${baseUrl}/projects/${projectSlug}`, { waitUntil: 'networkidle' });
  const phaseStrip = page.locator('ol[aria-label="Production journey phases"]');
  await visible(phaseStrip, 'Journey start of M3 observed path');
  await visible(cardWithHeading(page, 'Production path'), 'Production path at M3 start');

  const planLink = phaseStrip.getByRole('link').filter({ hasText: /^Plan/ }).first();
  await visible(planLink, 'Journey Plan phase navigation');
  await planLink.click();
  await page.waitForLoadState('networkidle');

  const shotRow = page.getByRole('row').filter({ hasText: shotCode }).first();
  await visible(shotRow, 'target shot row on Journey-to-Ready path');
  const openShot = shotRow.getByRole('link', { name: 'Open', exact: true });
  await visible(openShot, 'operator-visible Open shot action');
  await openShot.click();
  await page.waitForLoadState('networkidle');

  const readiness = page.getByLabel('Shot readiness and next action');
  await visible(readiness, 'Shot Workspace readiness surface');
  await visible(readiness.getByText(/Ready$/).first(), 'Shot Workspace Ready production state');
  await visible(readiness.getByText('Ready to generate the image', { exact: true }), 'ready image-generation reason');
  const queueImage = readiness.getByRole('link', { name: /^Queue image/ });
  await visible(queueImage, 'Ready next-safe-action Queue image');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: path.join(evidenceDir, 'm3-journey-ready-start-1440.png'), fullPage: true });

  await queueImage.click();
  await page.waitForLoadState('networkidle');
  await visible(page.getByRole('tab', { name: 'Prompts', selected: true }), 'Prompts tab active after Queue image');
  const preflight = page.getByLabel('Provider-safe preflight readiness');
  await visible(preflight, 'Provider-safe Preflight');
  await visible(preflight.getByLabel('Image generation preflight'), 'Image generation Preflight');
  assert.equal(await preflight.getByRole('button', { name: /queue|generate/i }).count(), 0, 'Preflight must remain read-only');
  await page.screenshot({ path: path.join(evidenceDir, 'm3-preflight-1440.png'), fullPage: true });

  const generationsTab = page.getByRole('tab', { name: 'Generations' });
  await visible(generationsTab, 'Generations tab before confirmation');
  await generationsTab.click();
  await page.waitForLoadState('networkidle');
  await visible(page.getByRole('tab', { name: 'Generations', selected: true }), 'Generations tab active');
  const confirmation = page.locator('section[aria-label="Image generation confirmation"]');
  await visible(confirmation, 'Image generation confirmation section');

  const prepareButton = confirmation.getByRole('button', { name: 'Prepare image', exact: true });
  await visible(prepareButton, 'Prepare image button');
  await prepareButton.click();

  await visible(confirmation.getByText('Provider', { exact: true }), 'prepared Provider');
  await visible(confirmation.getByText('Model', { exact: true }), 'prepared Model');
  await visible(confirmation.getByText('Estimated cost', { exact: true }), 'prepared Estimated cost');
  await visible(confirmation.getByRole('button', { name: 'Confirm image generation', exact: true }), 'explicit image confirmation button');
  await page.screenshot({ path: path.join(evidenceDir, 'm3-confirmation-1440.png'), fullPage: true });

  await confirmation.getByRole('button', { name: 'Confirm image generation', exact: true }).click();
  await visible(confirmation.getByText(/Already queued|Image queued/), 'pending enqueue result');
  await visible(confirmation.locator('.font-mono'), 'Generation ID after enqueue');
  await page.screenshot({ path: path.join(evidenceDir, 'm3-pending-generation-1440.png'), fullPage: true });

  await page.reload({ waitUntil: 'networkidle' });
  const generationsCard = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Generations \(/ }) }).first();
  await visible(generationsCard, 'Generations list after enqueue');
  await visible(generationsCard.getByRole('listitem').filter({ hasText: /pending/i }).first(), 'persisted pending Generation');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: path.join(evidenceDir, 'm3-pending-generation-persisted-1440.png'), fullPage: true });
  console.log('[browser-evidence] M3 PASS; worker/provider not invoked by this lane.');
}

const fixtureOutput = execFileSync(process.execPath, [tsxCli, fixture], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const legacySlug = outputValue(fixtureOutput, 'M1_LEGACY_SLUG');
const reassignmentSlug = outputValue(fixtureOutput, 'M1_REASSIGN_SLUG');
const reassignmentFormat = outputValue(fixtureOutput, 'M1_REASSIGN_FORMAT');
const bridgeSlug = outputValue(fixtureOutput, 'M2M3_SLUG');
const bridgeShotCode = outputValue(fixtureOutput, 'M2M3_SHOT_CODE');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  const smoke = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.ok(smoke && smoke.status() < 400, `browser smoke returned ${smoke?.status() ?? 'no response'}`);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: path.join(evidenceDir, '00-browser-lane-smoke.png'), fullPage: true });

  await runM1(page, legacySlug, reassignmentSlug, reassignmentFormat);
  await runM2(page, bridgeSlug);
  await runM3(page, bridgeSlug, bridgeShotCode);

  console.log('[browser-evidence] M1-M3 required browser evidence PASS.');
  process.exitCode = 0;
} finally {
  await browser.close();
}
