#!/usr/bin/env node
/**
 * Quality gate: browser storage must never be a data source.
 *
 * localStorage / sessionStorage may hold UI preferences in src/components/** only.
 * Three things fail here:
 *   - any use outside src/components/** and src/app/** (wrong layer entirely)
 *   - a use in src/app/** (move it into a src/components/** client component)
 *   - a use naming a production entity (project, scene, shot, prompt, asset,
 *     generation, approval, bible) instead of a UI preference key
 *
 * Runnable standalone: `node scripts/quality/no-localstorage-source.mjs`.
 * Exit 0 = clean, exit 1 = findings, exit 2 = internal error.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '.reports']);
const SCAN_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const MAX_BYTES = 2 * 1024 * 1024;

// Match the browser globals as identifiers being *used*, so a class named
// LocalStorageProvider (the server-side storage driver) is not mistaken for
// browser storage. Case-sensitive on purpose.
const STORAGE = /(?<![A-Za-z0-9_$])(?:window\.)?(?:localStorage|sessionStorage)\s*(?:\.|\[)/;
const ENTITY =
  /\b(project|projects|episode|episodes|scene|scenes|shot|shots|prompt|prompts|asset|assets|generation|generations|approval|approvals|bible|bibles|character|characters|location|locations|prop|props|storyboard|timeline|voiceProfile)\b/i;
// Preference keys are matched as substrings so camelCase keys such as
// `sidebarWidth` or `lastTabId` still count as UI preferences.
const PREFERENCE = /(theme|sidebar|collapsed|panel|zoom|locale|language|tab|layout|preference|prefs|dismissed|onboard|density|fontsize)/i;

const ALLOWED_PREFIXES = ['src/components/', 'src/app/'];

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
  let allowedUses = 0;

  for (const file of files) {
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
    if (!STORAGE.test(text)) continue;

    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const inUiLayer = ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix));
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (!STORAGE.test(line)) continue;
      const snippet = line.trim().slice(0, 150);

      if (!inUiLayer) {
        findings.push({
          file: rel,
          line: i + 1,
          reason: 'browser storage outside the UI layer (only src/components/** may use it, for UI preferences)',
          snippet,
        });
        continue;
      }
      if (ENTITY.test(line) && !PREFERENCE.test(line)) {
        findings.push({
          file: rel,
          line: i + 1,
          reason: 'production data kept in browser storage instead of SQLite',
          snippet,
        });
        continue;
      }
      if (rel.startsWith('src/app/')) {
        findings.push({
          file: rel,
          line: i + 1,
          reason: 'browser storage used in a route/page; keep it in a src/components/** client component',
          snippet,
        });
        continue;
      }
      allowedUses += 1;
    }
  }

  if (findings.length === 0) {
    process.stdout.write(
      `[no-localstorage-source] OK — scanned ${scanned} files (${allowedUses} allowed UI-preference use(s))\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`[no-localstorage-source] FAIL — ${findings.length} finding(s) in ${scanned} scanned files\n\n`);
  for (const finding of findings) {
    process.stderr.write(`  ${finding.file}:${finding.line}\n    ${finding.snippet}\n    -> ${finding.reason}\n`);
  }
  process.stderr.write(
    [
      '',
      'CLAUDE.md rule 2: persistence is not optional. Project, scene, shot, prompt, asset,',
      'generation, approval and export data is written through @/application/services/**',
      'into a Drizzle repository. localStorage/sessionStorage is for UI preferences in',
      'src/components/** only (sidebar width, last selected tab, theme).',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[no-localstorage-source] internal error: ${error && error.message ? error.message : error}\n`);
  process.exit(2);
}
