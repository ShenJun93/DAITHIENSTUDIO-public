import { cookies, headers } from 'next/headers';
import type { Studio } from '@/application/ports';
import { DomainError } from '@/domain/errors';
import { getStudio } from '@/infrastructure/container';
import {
  authorizeStudioMutation,
  issueStudioSession,
  STUDIO_MUTATION_SESSION_COOKIE,
  STUDIO_MUTATION_SESSION_TTL_MS,
} from '@/infrastructure/security/studioMutationAuth';

function policyFor(studio: Studio) {
  return {
    apiKey: studio.config.apiKey,
    hasNonOfflineProvider: studio.providers.descriptors().some((descriptor) => !descriptor.offline),
  };
}

export function studioMutationSessionCookieOptions(publicBaseUrl: string) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: publicBaseUrl.startsWith('https://'),
    path: '/',
    maxAge: Math.floor(STUDIO_MUTATION_SESSION_TTL_MS / 1000),
  };
}

export async function getAuthorizedActionStudio(): Promise<Studio> {
  const studio = getStudio();
  const policy = policyFor(studio);
  if (!policy.apiKey) {
    authorizeStudioMutation(policy, {});
    return studio;
  }

  const headerStore = await headers();
  const presentedKey = headerStore.get('x-studio-key');
  if (presentedKey != null) {
    authorizeStudioMutation(policy, { presentedKey, allowSession: true });
    return studio;
  }
  const cookieStore = await cookies();
  authorizeStudioMutation(policy, {
    sessionToken: cookieStore.get(STUDIO_MUTATION_SESSION_COOKIE)?.value,
    allowSession: true,
  });
  return studio;
}

export async function unlockStudioMutationSession(presentedKey: string): Promise<void> {
  const studio = getStudio();
  const policy = policyFor(studio);
  if (!policy.apiKey) {
    if (policy.hasNonOfflineProvider) {
      throw new DomainError('UNAUTHORIZED', 'Configure STUDIO_API_KEY before enabling a paid provider.');
    }
    return;
  }
  const token = issueStudioSession(policy.apiKey, presentedKey);
  const cookieStore = await cookies();
  cookieStore.set(STUDIO_MUTATION_SESSION_COOKIE, token, studioMutationSessionCookieOptions(studio.config.publicBaseUrl));
}

export async function lockStudioMutationSession(): Promise<void> {
  const studio = getStudio();
  const cookieStore = await cookies();
  cookieStore.set(STUDIO_MUTATION_SESSION_COOKIE, '', {
    ...studioMutationSessionCookieOptions(studio.config.publicBaseUrl),
    maxAge: 0,
  });
}
