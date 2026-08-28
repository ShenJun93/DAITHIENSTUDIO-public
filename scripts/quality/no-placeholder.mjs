#!/usr/bin/env node
/**
 * Quality gate: no unfinished work in src/ or scripts/.
 *
 * Fails on stub markers and on empty / whitespace-only source files.
 * Runnable standalone: `node scripts/quality/no-placeholder.mjs`.
 * Exit 0 = clean, exit 1 = findings, exit 2 = internal error.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '.reports', 'migrations']);
const SCAN_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const MAX_BYTES = 2 * 1024 * 1024;

// Marker words are assembled from fragments so this scanner never flags itself.
const MARKERS = [
  { label: `${'TO'}${'DO'}`, re: new RegExp(`\\b${'TO'}${'DO'}\\b`) },
  { label: `${'FIX'}${'ME'}`, re: new RegExp(`\\b${'FIX'}${'ME'}\\b`) },
  { label: 'X'.repeat(3), re: /\bX{3}\b/ },
  // The word only means "stub" when it is not the HTML `placeholder` attribute,
  // a Tailwind `placeholder:` variant, or a React prop. Those are real UI, not
  // unfinished work.
  {
    label: `${'place'}${'holder'}`,
    re: new RegExp(`\\b${'place'}${'holder'}\\b(?![=:(\\]}"'\`]|\\s*[=:])`, 'i'),
  },
  { label: `${'not'} implemented`, re: new RegExp(`${'not'}\\s+implemented`, 'i') },
  { label: 'unimplemented', re: /\bunimplemented\b/i },
  { label: 'HACK', re: /\bHACK\b/ },
];

const SELF = path.resolve(process.argv[1] ?? '');

function walk(dir, files, depth = 0) {
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
    if (entry.isDirectory()) walk(full, files, depth + 1);
    else if (entry.isFile() && SCAN_EXT.test(entry.name)) files.push(full);
  }
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const full = path.join(ROOT, dir);
    if (existsSync(full)) walk(full, files);
  }

  const findings = [];
  let scanned = 0;

  for (const file of files) {
    if (path.resolve(file) === SELF) continue;
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size > MAX_BYTES) continue;
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    scanned += 1;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');

    if (text.trim().length === 0) {
      findings.push({ file: rel, line: 1, label: 'empty file', text: '(no content)' });
      continue;
    }

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      for (const marker of MARKERS) {
        if (marker.re.test(line)) {
          findings.push({ file: rel, line: i + 1, label: marker.label, text: line.trim().slice(0, 140) });
          break;
        }
      }
    }
  }

  if (findings.length === 0) {
    process.stdout.write(`[no-placeholder] OK — scanned ${scanned} files\n`);
    process.exit(0);
  }

  process.stderr.write(`[no-placeholder] FAIL — ${findings.length} finding(s) in ${scanned} scanned files\n\n`);
  for (const finding of findings) {
    process.stderr.write(`  ${finding.file}:${finding.line}  [${finding.label}]\n    ${finding.text}\n`);
  }
  process.stderr.write(
    '\nCLAUDE.md rule 1: no fake work. Finish the implementation or remove the stub and report the blocker.\n',
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[no-placeholder] internal error: ${error && error.message ? error.message : error}\n`);
  process.exit(2);
}
