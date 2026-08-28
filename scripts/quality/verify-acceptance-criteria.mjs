#!/usr/bin/env node
/**
 * Quality gate: every acceptance scenario has a test.
 *
 * Parses each `Scenario:` (and `Scenario Outline:`) name out of
 * docs/acceptance/*.feature, then asserts that the name appears as a test title in
 * at least one tests/**\/*.test.ts file.
 *
 * A missing docs/acceptance directory is a soft skip (exit 0).
 * Runnable standalone: `node scripts/quality/verify-acceptance-criteria.mjs`.
 * Exit 0 = covered, exit 1 = uncovered scenarios, exit 2 = internal error.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ACCEPTANCE_DIR = path.join(ROOT, 'docs', 'acceptance');
const TESTS_DIR = path.join(ROOT, 'tests');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '.reports']);
const MAX_BYTES = 4 * 1024 * 1024;

function walk(dir, files, matcher, depth = 0) {
  if (depth > 12) return;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files, matcher, depth + 1);
    else if (entry.isFile() && matcher.test(entry.name)) files.push(full);
  }
}

function readTextFile(file) {
  try {
    if (statSync(file).size > MAX_BYTES) return '';
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function normalise(value) {
  return value
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function collectScenarios() {
  const featureFiles = [];
  walk(ACCEPTANCE_DIR, featureFiles, /\.feature$/i);
  const scenarios = [];
  for (const file of featureFiles) {
    const text = readTextFile(file);
    if (!text) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      const match = /^\s*(?:Scenario Outline|Scenario|Kịch bản)\s*:\s*(.+?)\s*$/i.exec(line);
      if (!match) continue;
      const name = (match[1] ?? '').trim();
      if (!name) continue;
      scenarios.push({ name, file: rel, line: i + 1, key: normalise(name) });
    }
  }
  return { featureFiles, scenarios };
}

function collectTestTitles() {
  const testFiles = [];
  walk(TESTS_DIR, testFiles, /\.test\.(ts|tsx|mts|cts|js|jsx|mjs)$/i);
  const titles = [];
  for (const file of testFiles) {
    const text = readTextFile(file);
    if (!text) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const re = /\b(?:it|test|describe)(?:\.\w+)*\s*\(\s*(['"`])([\s\S]*?)\1/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const title = (match[2] ?? '').trim();
      if (!title) continue;
      titles.push({ title, file: rel, key: normalise(title) });
    }
  }
  return { testFiles, titles };
}

function main() {
  if (!existsSync(ACCEPTANCE_DIR)) {
    process.stdout.write('[verify-acceptance-criteria] OK — skipped, docs/acceptance/ does not exist yet\n');
    process.exit(0);
  }

  const { featureFiles, scenarios } = collectScenarios();

  if (featureFiles.length === 0 || scenarios.length === 0) {
    process.stdout.write(
      `[verify-acceptance-criteria] OK — scanned ${featureFiles.length} feature file(s), no scenarios declared yet\n`,
    );
    process.exit(0);
  }

  if (!existsSync(TESTS_DIR)) {
    process.stderr.write(
      `[verify-acceptance-criteria] FAIL — ${scenarios.length} scenario(s) declared but tests/ does not exist\n\n`,
    );
    for (const scenario of scenarios) {
      process.stderr.write(`  ${scenario.file}:${scenario.line}  Scenario: ${scenario.name}\n`);
    }
    process.stderr.write('\nAdd tests under tests/**/*.test.ts whose titles match these scenario names exactly.\n');
    process.exit(1);
  }

  const { testFiles, titles } = collectTestTitles();
  const titleKeys = new Map();
  for (const entry of titles) {
    if (!titleKeys.has(entry.key)) titleKeys.set(entry.key, entry.file);
  }

  const uncovered = [];
  for (const scenario of scenarios) {
    if (titleKeys.has(scenario.key)) continue;
    // Also accept a test title that contains the scenario name.
    const contained = [...titleKeys.keys()].some((key) => key.includes(scenario.key) && scenario.key.length > 8);
    if (contained) continue;
    uncovered.push(scenario);
  }

  if (uncovered.length === 0) {
    process.stdout.write(
      `[verify-acceptance-criteria] OK — ${scenarios.length} scenario(s) in ${featureFiles.length} feature file(s) covered by ${testFiles.length} test file(s)\n`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `[verify-acceptance-criteria] FAIL — ${uncovered.length}/${scenarios.length} scenario(s) have no matching test title\n\n`,
  );
  for (const scenario of uncovered) {
    process.stderr.write(`  ${scenario.file}:${scenario.line}\n    Scenario: ${scenario.name}\n`);
  }
  process.stderr.write(
    [
      '',
      'Add a test under tests/**/*.test.ts whose title is exactly the scenario name, e.g.',
      "  it('<scenario name>', async () => { ... })",
      'See .claude/rules/08-testing.md rule 8.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `[verify-acceptance-criteria] internal error: ${error && error.message ? error.message : error}\n`,
  );
  process.exit(2);
}
