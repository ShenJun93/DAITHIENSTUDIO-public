import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/domain/errors';
import {
  STUDIO_MUTATION_SESSION_COOKIE,
  STUDIO_MUTATION_SESSION_TTL_MS,
  issueStudioSession,
} from '@/infrastructure/security/studioMutationAuth';

const requestState = vi.hoisted(() => ({
  header: null as string | null,
  cookie: null as string | null,
  studio: null as any,
}));

const headersMock = vi.hoisted(() => vi.fn());
const cookiesMock = vi.hoisted(() => vi.fn());
const cookieSetMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

vi.mock('@/infrastructure/container', () => ({
  getStudio: () => requestState.studio,
}));

import { getAuthorizedActionStudio, unlockStudioMutationSession } from '@/app/_lib/actionAuth';

const KEY = 'configured-studio-key-1234567890';
const NOW_MS = Date.UTC(2026, 7, 10, 3, 0, 0);

function studio(apiKey: string | null, offline: boolean): any {
  return {
    config: { apiKey, publicBaseUrl: 'https://studio.test' },
    providers: { descriptors: () => [{ key: offline ? 'mock' : 'google', offline }] },
  };
}

function expectUnauthorized(error: unknown): void {
  expect(error).toBeInstanceOf(DomainError);
  expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
}

describe('getAuthorizedActionStudio', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    requestState.header = null;
    requestState.cookie = null;
    requestState.studio = studio(KEY, true);
    headersMock.mockReset().mockImplementation(async () => ({
      get: (name: string) => name.toLowerCase() === 'x-studio-key' ? requestState.header : null,
    }));
    cookiesMock.mockReset().mockImplementation(async () => ({
      get: (name: string) => name === STUDIO_MUTATION_SESSION_COOKIE && requestState.cookie
        ? { name, value: requestState.cookie }
        : undefined,
      set: cookieSetMock,
    }));
    cookieSetMock.mockReset();
  });

  it('keeps mock-only no-key mode open without touching request context', async () => {
    requestState.studio = studio(null, true);

    await expect(getAuthorizedActionStudio()).resolves.toBe(requestState.studio);
    expect(headersMock).not.toHaveBeenCalled();
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it('fails closed when a paid provider is configured without a studio key', async () => {
    requestState.studio = studio(null, false);

    const error = await getAuthorizedActionStudio().catch((caught) => caught);

    expectUnauthorized(error);
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it('authorizes a configured-key action with the correct explicit header', async () => {
    requestState.header = KEY;

    await expect(getAuthorizedActionStudio()).resolves.toBe(requestState.studio);
    expect(headersMock).toHaveBeenCalledTimes(1);
  });

  it('authorizes a browser action with a valid signed session', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    requestState.cookie = issueStudioSession(
      KEY,
      KEY,
      NOW_MS,
      Uint8Array.from(Buffer.from('00112233445566778899aabbccddeeff', 'hex')),
    );

    await expect(getAuthorizedActionStudio()).resolves.toBe(requestState.studio);
    expect(cookiesMock).toHaveBeenCalledTimes(1);
  });

  it('denies a wrong explicit header without falling back to a valid session', async () => {
    requestState.header = 'wrong-key';
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    requestState.cookie = issueStudioSession(
      KEY,
      KEY,
      NOW_MS,
      Uint8Array.from(Buffer.from('00112233445566778899aabbccddeeff', 'hex')),
    );

    const error = await getAuthorizedActionStudio().catch((caught) => caught);

    expectUnauthorized(error);
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it('denies a configured-key action with neither a header nor a valid session', async () => {
    const error = await getAuthorizedActionStudio().catch((caught) => caught);

    expectUnauthorized(error);
    expect(cookiesMock).toHaveBeenCalledTimes(1);
  });

  it('unlocks with a bounded secure HttpOnly cookie that contains no credential', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);

    await expect(unlockStudioMutationSession(KEY)).resolves.toBeUndefined();

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    const [name, token, options] = cookieSetMock.mock.calls[0]!;
    expect(name).toBe(STUDIO_MUTATION_SESSION_COOKIE);
    expect(token).not.toContain(KEY);
    expect(options).toEqual({
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: STUDIO_MUTATION_SESSION_TTL_MS / 1000,
    });
  });

  it('does not create a cookie or expose the credential when unlock fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const error = await unlockStudioMutationSession('wrong-key').catch((caught) => caught);

    expectUnauthorized(error);
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toContain('wrong-key');
    expect(String((error as Error).message)).not.toContain('wrong-key');
  });
});
