'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthorizedActionStudio } from '@/app/_lib/actionAuth';
import { resolveOperatorIdFromRequest } from '@/app/_lib/operator';
import { createProjectService } from '@/application/services/projectService';
import {
  createPromptApprovalService,
  type PromptApprovalReviewState,
} from '@/application/services/promptApprovalService';
import { APPROVAL_DECISIONS } from '@/domain/enums';
import { isDomainError } from '@/domain/errors';

const baseIntentSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  shotCode: z.string().trim().min(1).max(200),
  kind: z.enum(['image', 'video']),
});

const promptDecisionSchema = baseIntentSchema.extend({
  version: z.number().int().positive(),
  decision: z.enum(APPROVAL_DECISIONS),
  note: z.string().max(2000).default(''),
});

export interface PromptApprovalActionResult {
  ok: boolean;
  message: string;
  code?: string;
}

export interface PromptApprovalReadResult extends PromptApprovalActionResult {
  state?: PromptApprovalReviewState | null;
}

export async function getPromptApprovalStateAction(
  slug: string,
  shotCode: string,
  kind: 'image' | 'video',
): Promise<PromptApprovalReadResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const parsed = baseIntentSchema.parse({ slug, shotCode, kind });
    const project = await createProjectService(studio).get(parsed.slug);
    const shot = await studio.shots.byCode(project.id, parsed.shotCode);
    if (!shot) return { ok: false, message: 'Shot not found for this project.', code: 'NOT_FOUND' };

    const state = await createPromptApprovalService(studio).reviewForShot(project.id, shot.id, parsed.kind);
    return { ok: true, message: 'Prompt approval state loaded.', state };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: 'Invalid prompt approval request.', code: 'VALIDATION_FAILED' };
    }
    if (isDomainError(error)) return { ok: false, message: error.message, code: error.code };
    console.error('[prompt-approval-read] unexpected error', error);
    return { ok: false, message: 'Prompt approval state could not be loaded.', code: 'INTERNAL' };
  }
}

export async function decidePromptVersionAction(
  slug: string,
  shotCode: string,
  kind: 'image' | 'video',
  version: number,
  decision: (typeof APPROVAL_DECISIONS)[number],
  note = '',
): Promise<PromptApprovalActionResult> {
  try {
    // Authorization precedes all repository-backed reads.
    const studio = await getAuthorizedActionStudio();
    const parsed = promptDecisionSchema.parse({ slug, shotCode, kind, version, decision, note });
    const project = await createProjectService(studio).get(parsed.slug);
    const shot = await studio.shots.byCode(project.id, parsed.shotCode);
    if (!shot) return { ok: false, message: 'Shot not found for this project.', code: 'NOT_FOUND' };
    const decidedBy = await resolveOperatorIdFromRequest(studio);

    await createPromptApprovalService(studio).decideVersion(
      project.id,
      shot.id,
      parsed.kind,
      parsed.version,
      parsed.decision,
      parsed.note,
      decidedBy,
    );

    revalidatePath(`/projects/${encodeURIComponent(project.slug)}/shots/${encodeURIComponent(shot.code)}`);
    return { ok: true, message: `${parsed.kind} prompt v${parsed.version} marked ${parsed.decision}.` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: 'Invalid prompt approval request.', code: 'VALIDATION_FAILED' };
    }
    if (isDomainError(error)) return { ok: false, message: error.message, code: error.code };
    console.error('[prompt-approval] unexpected error', error);
    return { ok: false, message: 'Prompt approval failed.', code: 'INTERNAL' };
  }
}
