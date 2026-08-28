#!/usr/bin/env node
/**
 * Quality gate: provider names stay behind the provider adapters.
 *
 * A provider name (veo, imagen, gemini, openai, runway, ...) may appear only in:
 *   - src/infrastructure/providers/**
 *   - src/domain/cost.ts          (the pricing table)
 *   - tests/**, docs/**, .env.example, scripts/**
 * Anywhere else it means a service, route, page or component has been wired to a
 * specific vendor instead of a port.
 *
 * Runnable standalone: `node scripts/quality/no-provider-hardcode.mjs`.
 * Exit 0 = clean, exit 1 = findings, exit 2 = internal error.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '.reports']);
const SCAN_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_PREFIXES = ['src/infrastructure/providers/'];
const ALLOWED_FILES = ['src/domain/cost.ts'];

const PROVIDERS = [
  { name: 'veo', re: /\bveo(?:[-_.]?\d[\w.-]*)?\b/i },
  { name: 'imagen', re: /\bimagen(?:[-_.]?\d[\w.-]*)?\b/i },
  { name: 'gemini', re: /\bgemini(?:[-_.]?[\d.]+[\w.-]*)?\b/i },
  { name: 'openai', re: /\bopen[-_]?ai\b/i },
  { name: 'runway', re: /\brunway(?:ml)?\b/i },
  { name: 'midjourney', re: /\bmidjourney\b/i },
  { name: 'stability', re: /\bstable[-_]?diffusion\b|\bstability[-_]?ai\b/i },
  { name: 'elevenlabs', re: /\beleven[-_]?labs\b/i },
  { name: 'anthropic', re: /\banthropic\b/i },
  { name: 'kling', re: /\bkling(?:[-_.]?\d[\w.-]*)?\b/i },
  { name: 'luma', re: /\bluma(?:[-_]?labs)?\b/i },
  { name: 'sora', re: /\bsora\b/ },
];

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

function isAllowed(rel) {
  if (ALLOWED_FILES.includes(rel)) return true;
  return ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const full = path.join(ROOT, dir);
    if (existsSync(full)) walk(full, files);
  }

  const findings = [];
  let scanned = 0;
  let exempted = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (isAllowed(rel)) {
      exempted += 1;
      continue;
    }
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

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      for (const provider of PROVIDERS) {
        if (provider.re.test(line)) {
          findings.push({ file: rel, line: i + 1, provider: provider.name, snippet: line.trim().slice(0, 150) });
          break;
        }
      }
    }
  }

  if (findings.length === 0) {
    process.stdout.write(
      `[no-provider-hardcode] OK — scanned ${scanned} files (${exempted} exempt under src/infrastructure/providers/ or src/domain/cost.ts)\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`[no-provider-hardcode] FAIL — ${findings.length} finding(s) in ${scanned} scanned files\n\n`);
  for (const finding of findings) {
    process.stderr.write(`  ${finding.file}:${finding.line}  [${finding.provider}]\n    ${finding.snippet}\n`);
  }
  process.stderr.write(
    [
      '',
      'Provider names belong in src/infrastructure/providers/** (adapters and capabilities)',
      'and, for pricing only, in src/domain/cost.ts. Everywhere else, depend on the port in',
      'src/application/ports.ts and let src/infrastructure/container.ts pick the adapter from',
      'AI_TEXT_PROVIDER / AI_IMAGE_PROVIDER / AI_VIDEO_PROVIDER / AI_VOICE_PROVIDER.',
      'Model ids belong in environment variables (see .env.example), not in logic.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[no-provider-hardcode] internal error: ${error && error.message ? error.message : error}\n`);
  process.exit(2);
}
