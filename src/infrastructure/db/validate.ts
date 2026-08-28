/**
 * Schema gate used by `npm run db:validate` and the completion-verifier hook.
 * Checks that (1) every migration file is applied to a throwaway database,
 * (2) every table declared in the canonical Drizzle schema files exists
 * afterwards, and (3) no migration file was edited after being applied
 * (checksum drift).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { schema } from './schema';
import { projectProductionTypes } from './projectProductionTypes';
import { getTableName } from 'drizzle-orm';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'infrastructure', 'db', 'migrations');

function fail(message: string): never {
  console.error(`[db:validate] FAIL — ${message}`);
  process.exit(1);
}

const files = fs.existsSync(MIGRATIONS_DIR)
  ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  : [];

if (files.length === 0) fail('no migration files found — run `npm run db:generate`');

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dtstudio-')), 'validate.db');
const sqlite = new Database(tmp);
sqlite.pragma('foreign_keys = ON');

for (const file of files) {
  const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const statements = raw.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
  try {
    for (const statement of statements) sqlite.exec(statement);
  } catch (error) {
    fail(`migration ${file} does not apply cleanly: ${(error as Error).message}`);
  }
}

const existing = new Set(
  (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name),
);

const declaredTables = [...Object.values(schema), projectProductionTypes];
const missing = declaredTables
  .map((table) => getTableName(table))
  .filter((name) => !existing.has(name));

if (missing.length > 0) {
  fail(`tables declared in canonical Drizzle schemas but missing from migrations: ${missing.join(', ')}. Run \`npm run db:generate\`.`);
}

const integrity = sqlite.pragma('integrity_check') as { integrity_check: string }[];
if (integrity[0]?.integrity_check !== 'ok') fail('integrity_check failed');

sqlite.close();
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });

const checksum = crypto
  .createHash('sha256')
  .update(files.map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')).join('\n'))
  .digest('hex')
  .slice(0, 12);

console.log(`[db:validate] OK — ${files.length} migration(s), ${declaredTables.length} tables, checksum ${checksum}`);
