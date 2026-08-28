import { notFound } from '@/domain/errors';
import type { ApprovalDecisions } from '@/domain/enums';
import type { Studio } from '../ports';
import type { ApprovalRecord } from '../records';

export type PromptApprovalKind = 'image' | 'video';

export interface PromptVersionApprovalState {
  promptId: string;
  version: number;
  targetId: string;
  latest: ApprovalRecord | null;
  history: ApprovalRecord[];
}

export interface PromptApprovalReviewState extends PromptVersionApprovalState {
  stalePrior: { version: number; decision: ApprovalRecord } | null;
}

function promptVersionTargetId(promptId: string, version: number): string {
  return `${promptId}@${version}`;
}

function orderedApprovals(history: ApprovalRecord[]): ApprovalRecord[] {
  return [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createPromptApprovalService(studio: Studio) {
  async function requireOwnedPrompt(projectId: string, shotId: string, kind: PromptApprovalKind) {
    const shot = await studio.shots.byId(shotId);
    if (!shot || shot.projectId !== projectId) throw notFound('Shot', shotId);

    const prompt = await studio.prompts.findForShot(shot.id, kind);
    if (!prompt || prompt.projectId !== projectId || prompt.shotId !== shot.id) {
      throw notFound('Prompt', `${shot.id}:${kind}`);
    }
    return { shot, prompt };
  }

  async function currentState(projectId: string, shotId: string, kind: PromptApprovalKind) {
    const shot = await studio.shots.byId(shotId);
    if (!shot || shot.projectId !== projectId) throw notFound('Shot', shotId);

    const prompt = await studio.prompts.findForShot(shot.id, kind);
    if (!prompt) return null;
    if (prompt.projectId !== projectId || prompt.shotId !== shot.id) throw notFound('Prompt', `${shot.id}:${kind}`);

    const version = await studio.prompts.latestVersion(prompt.id);
    if (!version) return null;

    const targetId = promptVersionTargetId(prompt.id, version.version);
    const history = orderedApprovals(await studio.approvals.listForTarget(projectId, 'prompt', targetId));
    return { prompt, version, targetId, history };
  }

  return {
    async latestForShot(projectId: string, shotId: string, kind: PromptApprovalKind): Promise<PromptVersionApprovalState | null> {
      const current = await currentState(projectId, shotId, kind);
      if (!current) return null;
      return {
        promptId: current.prompt.id,
        version: current.version.version,
        targetId: current.targetId,
        latest: current.history.at(-1) ?? null,
        history: current.history,
      };
    },

    async reviewForShot(projectId: string, shotId: string, kind: PromptApprovalKind): Promise<PromptApprovalReviewState | null> {
      const current = await currentState(projectId, shotId, kind);
      if (!current) return null;

      let stalePrior: PromptApprovalReviewState['stalePrior'] = null;
      if (current.history.length === 0) {
        const versions = await studio.prompts.versions(current.prompt.id);
        const older = versions
          .map((entry) => entry.version)
          .filter((version) => version !== current.version.version)
          .sort((a, b) => b - a);
        const candidates: Array<{ version: number; decision: ApprovalRecord }> = [];
        for (const version of older) {
          const history = orderedApprovals(
            await studio.approvals.listForTarget(projectId, 'prompt', promptVersionTargetId(current.prompt.id, version)),
          );
          const decision = history.at(-1);
          if (decision) candidates.push({ version, decision });
        }
        candidates.sort((a, b) => b.decision.createdAt.localeCompare(a.decision.createdAt));
        stalePrior = candidates[0] ?? null;
      }

      return {
        promptId: current.prompt.id,
        version: current.version.version,
        targetId: current.targetId,
        latest: current.history.at(-1) ?? null,
        history: current.history,
        stalePrior,
      };
    },

    async decideVersion(
      projectId: string,
      shotId: string,
      kind: PromptApprovalKind,
      requestedVersion: number,
      decision: ApprovalDecisions,
      note: string,
      decidedBy: string,
    ): Promise<ApprovalRecord> {
      const { prompt } = await requireOwnedPrompt(projectId, shotId, kind);
      const currentVersion = await studio.prompts.latestVersion(prompt.id);
      if (!currentVersion || currentVersion.version !== requestedVersion) {
        throw notFound('CurrentPromptVersion', `${shotId}:${kind}:v${requestedVersion}`);
      }

      const version = await studio.prompts.version(prompt.id, requestedVersion);
      if (!version) throw notFound('PromptVersion', `${shotId}:${kind}:v${requestedVersion}`);

      return studio.approvals.record(projectId, {
        targetType: 'prompt',
        targetId: promptVersionTargetId(prompt.id, version.version),
        decision,
        note,
        decidedBy,
      });
    },
  };
}

export type PromptApprovalService = ReturnType<typeof createPromptApprovalService>;
