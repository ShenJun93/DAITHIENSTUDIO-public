/**
 * Destructive: deletes the local SQLite file. Only ever used explicitly via
 * `npm run db:reset`; never called automatically by another script, because
 * "reset the database" must not be the default answer to a broken migration.
 */
import fs from 'node:fs';
import { closeDb, databaseFile } from './client';

const file = databaseFile();
closeDb();
for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const target = `${file}${suffix}`;
  if (fs.existsSync(target)) {
    fs.rmSync(target);
    console.log(`[db:reset] removed ${target}`);
  }
}
console.log('[db:reset] done — run `npm run db:migrate && npm run db:seed`');
