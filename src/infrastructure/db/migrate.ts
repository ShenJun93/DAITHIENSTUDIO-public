/**
 * Applies SQL migrations in order and records them in `_migrations`.
 * Idempotent: already-applied files are skipped, so this is safe to run on
 * every boot / deploy. Never resets the database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb, databaseFile } from './client';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'infrastructure', 'db', 'migrations');

export function runMigrations(): { applied: string[]; skipped: string[] } {
  const db = getDb();
  const sqlite = db.$client;
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const done = new Set(
    (sqlite.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file);
      continue;
    }
    const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = raw
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    const tx = sqlite.transaction(() => {
      for (const statement of statements) {
        sqlite.exec(statement);
      }
      sqlite.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    });
    tx();
    applied.push(file);
  }

  return { applied, skipped };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const result = runMigrations();
  console.log(`[db] file      : ${databaseFile()}`);
  console.log(`[db] applied   : ${result.applied.length ? result.applied.join(', ') : '(none)'}`);
  console.log(`[db] up to date: ${result.skipped.length} migration(s) already applied`);
}
