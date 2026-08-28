/**
 * Liveness / readiness probe. Must stay cheap and must not throw on an empty
 * database — a fresh install with zero projects is still healthy.
 */
import { GENERATION_KINDS } from '@/domain/enums';
import { getContext, ok, route } from '../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = route(async () => {
  const { studio } = getContext();

  // The cheapest possible statement that proves the connection and the schema
  // are both usable. An empty result is a pass, not a failure.
  await studio.projects.list({ limit: 1 });

  const defaultProviders: Record<string, string> = {};
  for (const kind of GENERATION_KINDS) {
    defaultProviders[kind] = studio.providers.defaultKeyFor(kind);
  }

  return ok({
    status: 'ok',
    database: 'connected',
    // Migration bookkeeping lives in `src/infrastructure/db/**`, which the app
    // layer may not import (architecture rule 01.5). `npm run db:validate` is
    // the command that reports applied migrations.
    migrations: null,
    providers: defaultProviders,
    storageDriver: studio.storage.driver,
  });
});
