/**
 * SQLite connection (better-sqlite3 + Drizzle).
 *
 * A single process-wide connection is intentional: SQLite is a file, and the
 * MVP is a single-operator studio. Swapping to PostgreSQL means replacing this
 * file and the dialect import — no domain or application code changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { schema } from './schema';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const globalForDb = globalThis as unknown as { __studioDb?: Db };

export function databaseFile(): string {
  const raw = process.env.DATABASE_URL ?? './data/studio.db';
  const cleaned = raw.startsWith('file:') ? raw.slice('file:'.length) : raw;
  return path.resolve(process.cwd(), cleaned);
}

function createDb(): Db {
  const file = databaseFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema }) as Db;
}

export function getDb(): Db {
  if (!globalForDb.__studioDb) {
    globalForDb.__studioDb = createDb();
  }
  return globalForDb.__studioDb;
}

export function closeDb(): void {
  globalForDb.__studioDb?.$client.close();
  globalForDb.__studioDb = undefined;
}
