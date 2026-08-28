'use server';

import { isDomainError } from '@/domain/errors';
import { studioUnlockInputSchema } from '@/domain/schemas';
import { lockStudioMutationSession, unlockStudioMutationSession } from '@/app/_lib/actionAuth';

export interface StudioUnlockResult {
  ok: boolean;
  message: string;
  code?: string;
  redirectTo?: string;
}

export async function unlockStudioAction(form: FormData): Promise<StudioUnlockResult> {
  try {
    const { apiKey } = studioUnlockInputSchema.parse({ apiKey: form.get('apiKey') });
    await unlockStudioMutationSession(apiKey);
    return { ok: true, message: 'Studio mutations unlocked for this browser.', redirectTo: '/' };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message, code: error.code };
    return { ok: false, message: 'Enter a valid studio key.', code: 'VALIDATION_FAILED' };
  }
}

export async function lockStudioAction(): Promise<StudioUnlockResult> {
  await lockStudioMutationSession();
  return { ok: true, message: 'Studio mutations locked for this browser.' };
}
