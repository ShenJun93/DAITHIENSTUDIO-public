'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthorizedActionStudio } from '@/app/_lib/actionAuth';
import { resolveOperatorIdFromRequest } from '@/app/_lib/operator';
import { createProjectService } from '@/application/services/projectService';
import {
  createVisualPackageApprovalService,
  type VisualPackageApprovalReviewState,
} from '@/application/services/visualPackageApprovalService';
import { APPROVAL_DECISIONS } from '@/domain/enums';
import { isDomainError } from '@/domain/errors';

const baseIntentSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  shotCode: z.string().trim().min(1).max(200),
});

const decisionSchema = baseIntentSchema.extend({
  expectedFingerprint: z.string().trim().min(1).max(256),
  decision: z.enum(APPROVAL_DECISIONS),
  note: z.string().max(2000).default(''),
});

export interface VisualPackageApprovalActionResult {
  ok: boolean;
  message: string;
  code?: string;
}

export interface VisualPackageApprovalReadResult extends VisualPackageApprovalActionResult {
  state?: VisualPackageApprovalReviewState;
}

export async function getVisualPackageApprovalStateAction(
  slug: string,
  shotCode: string,
): Promise<VisualPackageApprovalReadResult> {
  try {
    const studio = await getAuthorizedActionStudio();
    const parsed = baseIntentSchema.parse({ slug, shotCode });
    const project = await createProjectService(studio).get(parsed.slug);
    const shot = await studio.shots.byCode(project.id, parsed.shotCode);
    if (!shot) return { ok: false, message: 'Shot not found for this project.', code: 'NOT_FOUND' };

    const state = await createVisualPackageApprovalService(studio).reviewForShot(project.id, shot.id);
    return { ok: true, message: 'Visual package approval state loaded.', state };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: 'Invalid visual package approval request.', code: 'VALIDATION_FAILED' };
    }
    if (isDomainError(error)) return { ok: false, message: error.message, code: error.code };
    console.error('[visual-package-approval-read] unexpected error', error);
    return { ok: false, message: 'Visual package approval state could not be loaded.', code: 'INTERNAL' };
  }
}

export async function decideVisualPackageAction(
  slug: string,
  shotCode: string,
  expectedFingerprint: string,
  decision: (typeof APPROVAL_DECISIONS)[number],
  note = '',
): Promise<VisualPackageApprovalActionResult> {
  try {
    // Authorization precedes all repository-backed reads.
    const studio = await getAuthorizedActionStudio();
    const parsed = decisionSchema.parse({ slug, shotCode, expectedFingerprint, decision, note });
    const project = await createProjectService(studio).get(parsed.slug);
    const shot = await studio.shots.byCode(project.id, parsed.shotCode);
    if (!shot) return { ok: false, message: 'Shot not found for this project.', code: 'NOT_FOUND' };
    const decidedBy = await resolveOperatorIdFromRequest(studio);

    await createVisualPackageApprovalService(studio).decideCurrentPackage(
      project.id,
      shot.id,
      parsed.expectedFingerprint,
      parsed.decision,
      parsed.note,
      decidedBy,
    );

    revalidatePath(`/projects/${encodeURIComponent(project.slug)}/shots/${encodeURIComponent(shot.code)}`);
    return { ok: true, message: `Visual package marked ${parsed.decision}.` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: 'Invalid visual package approval request.', code: 'VALIDATION_FAILED' };
    }
    if (isDomainError(error)) return { ok: false, message: error.message, code: error.code };
    console.error('[visual-package-approval] unexpected error', error);
    return { ok: false, message: 'Visual package approval failed.', code: 'INTERNAL' };
  }
}
