import { z } from 'zod';
import type { ApprovalDecisions } from '@/domain/enums';
import { DomainError } from '@/domain/errors';
import {
  visualControlStateSchema,
  type VisualControlState,
} from '@/domain/visualControl/types';
import {
  deriveVisualPackageApprovalEligibility,
  type VisualPackageApprovalEligibility,
} from '@/domain/visualControl/packageApproval';
import type { Studio } from '../ports';
import type { ApprovalRecord } from '../records';
import { createVisualControlService } from './visualControlService';

const ENVELOPE_KIND = 'vc8-visual-package-v1' as const;
const TARGET_PREFIX = 'visual-package:';

const visualPackageApprovalEnvelopeSchema = z.object({
  kind: z.literal(ENVELOPE_KIND),
  operatorNote: z.string(),
  packageFingerprint: z.string().min(1),
  package: visualControlStateSchema,
});

type VisualPackageApprovalEnvelope = z.infer<typeof visualPackageApprovalEnvelopeSchema>;

export interface VisualPackageApprovalEntry {
  approval: ApprovalRecord;
  operatorNote: string;
  packageFingerprint: string;
  package: VisualControlState;
}

export interface VisualPackageApprovalReviewState {
  currentFingerprint: string;
  eligibility: VisualPackageApprovalEligibility;
  latest: VisualPackageApprovalEntry | null;
  latestApproved: VisualPackageApprovalEntry | null;
  history: VisualPackageApprovalEntry[];
  currentApproved: boolean;
  invalidated: boolean;
}

type ReadState = (projectId: string, shotId: string) => Promise<VisualControlState>;

function targetIdForShot(shotId: string): string {
  return `${TARGET_PREFIX}${shotId}`;
}

function encodeEnvelope(state: VisualControlState, operatorNote: string): string {
  const envelope: VisualPackageApprovalEnvelope = {
    kind: ENVELOPE_KIND,
    operatorNote,
    packageFingerprint: state.packageFingerprint,
    package: state,
  };
  return JSON.stringify(visualPackageApprovalEnvelopeSchema.parse(envelope));
}

function decodeEnvelope(approval: ApprovalRecord): VisualPackageApprovalEntry | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(approval.note);
  } catch {
    return null;
  }
  const parsed = visualPackageApprovalEnvelopeSchema.safeParse(decoded);
  if (!parsed.success) return null;
  return {
    approval,
    operatorNote: parsed.data.operatorNote,
    packageFingerprint: parsed.data.packageFingerprint,
    package: parsed.data.package,
  };
}

function ordered(entries: VisualPackageApprovalEntry[]): VisualPackageApprovalEntry[] {
  return [...entries].sort((a, b) => a.approval.createdAt.localeCompare(b.approval.createdAt));
}

export function createVisualPackageApprovalService(
  studio: Studio,
  readState: ReadState = (projectId, shotId) => createVisualControlService(studio).overview(projectId, shotId),
) {
  async function current(projectId: string, shotId: string) {
    const state = await readState(projectId, shotId);
    return { state, eligibility: deriveVisualPackageApprovalEligibility(state) };
  }

  return {
    async reviewForShot(projectId: string, shotId: string): Promise<VisualPackageApprovalReviewState> {
      const { state, eligibility } = await current(projectId, shotId);
      const approvals = await studio.approvals.listForTarget(projectId, 'shot', targetIdForShot(shotId));
      const history = ordered(
        approvals.map(decodeEnvelope).filter((entry): entry is VisualPackageApprovalEntry => entry !== null),
      );
      const latest = history.at(-1) ?? null;
      const latestApproved = [...history].reverse().find((entry) => entry.approval.decision === 'approved') ?? null;
      const currentApproved = latest?.approval.decision === 'approved' && latest.packageFingerprint === state.packageFingerprint;
      const invalidated = latestApproved !== null && latestApproved.packageFingerprint !== state.packageFingerprint;
      return {
        currentFingerprint: state.packageFingerprint,
        eligibility,
        latest,
        latestApproved,
        history,
        currentApproved,
        invalidated,
      };
    },

    async decideCurrentPackage(
      projectId: string,
      shotId: string,
      expectedFingerprint: string,
      decision: ApprovalDecisions,
      operatorNote: string,
      decidedBy: string,
    ): Promise<VisualPackageApprovalEntry> {
      const { state, eligibility } = await current(projectId, shotId);
      if (state.packageFingerprint !== expectedFingerprint) {
        throw new DomainError(
          'CONFLICT',
          'The visual package changed after it was loaded. Review the current package before deciding again.',
          { expectedFingerprint, currentFingerprint: state.packageFingerprint },
        );
      }
      if (decision === 'approved' && !eligibility.eligible) {
        throw new DomainError('CONFLICT', 'This visual package is not eligible for approval.', {
          reasons: eligibility.reasons,
        });
      }

      const approval = await studio.approvals.record(projectId, {
        targetType: 'shot',
        targetId: targetIdForShot(shotId),
        decision,
        note: encodeEnvelope(state, operatorNote),
        decidedBy,
      });
      const entry = decodeEnvelope(approval);
      if (!entry) {
        throw new DomainError('INTERNAL', 'Recorded visual package approval could not be decoded.');
      }
      return entry;
    },
  };
}

export type VisualPackageApprovalService = ReturnType<typeof createVisualPackageApprovalService>;
