/**
 * Provider capability catalogue for the UI's provider picker.
 *
 * Descriptors carry keys, labels, model lists and capability flags only. No API
 * key and no environment value is ever included in this payload.
 */
import { GENERATION_KINDS } from '@/domain/enums';
import { getContext, ok, route } from '../_lib/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = route(async () => {
  const { studio } = getContext();

  const defaults = GENERATION_KINDS.map((kind) => {
    const providerKey = studio.providers.defaultKeyFor(kind);
    return { kind, provider: providerKey, model: studio.providers.defaultModelFor(kind, providerKey) };
  });

  return ok({ providers: studio.providers.descriptors(), defaults });
});
