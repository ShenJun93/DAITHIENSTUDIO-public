import { DomainError, notFound } from '@/domain/errors';
import type { GenerationRecord } from '../records';
import type { Studio } from '../ports';
import { createGenerationService } from './generationService';

export function createGenerationControlService(studio: Studio) {
  const { generations, projects, shots, activity, config, clock } = studio;

  return {
    async retryFailed(id: string): Promise<GenerationRecord> {
      const source = await generations.byId(id);
      if (!source) throw notFound('Generation', id);
      if (source.status !== 'failed') {
        throw new DomainError('CONFLICT', `Generation ${id} is ${source.status}; only failed jobs can be retried.`);
      }

      if (source.kind === 'image' || source.kind === 'video') {
        throw new DomainError(
          'CONFIRMATION_REQUIRED',
          `Failed ${source.kind} generations require a fresh prepare and explicit confirmation before retry.`,
        );
      }

      const project = await projects.byId(source.projectId);
      if (!project) throw notFound('Project', source.projectId);

      // Stable for the failed source record: a double-click/repeated submission
      // reuses the same retry job instead of spending twice.
      const retryKey = `manual-retry:${source.id}:${source.attempts}`;
      const existing = await generations.byIdempotencyKey(retryKey);
      if (existing) return existing;

      const ceiling = project.costLimitUsd > 0 ? project.costLimitUsd : config.costLimitUsdPerProject;
      let retried: GenerationRecord;
      try {
        retried = await generations.enqueue(
          {
            projectId: source.projectId,
            shotId: source.shotId,
            promptId: source.promptId,
            promptVersion: source.promptVersion,
            kind: source.kind,
            provider: source.provider,
            model: source.model,
            prompt: source.prompt,
            negativePrompt: source.negativePrompt,
            params: source.params,
            referenceAssetIds: source.referenceAssetIds,
            seed: source.seed,
            status: 'pending',
            priority: source.priority,
            maxAttempts: source.maxAttempts,
            scheduledAt: clock.nowIso(),
            estimatedCostUsd: source.estimatedCostUsd,
            idempotencyKey: retryKey,
          },
          ceiling,
        );
      } catch (error) {
        // Two concurrent retryFailed(id) calls for the same source can both pass the
        // byIdempotencyKey check above before either commits (idempotencyKey carries a
        // UNIQUE constraint — src/infrastructure/db/schema.ts). The race loser's insert
        // then fails; reuse the winner's record instead of surfacing a raw persistence
        // error, matching the idempotency-reuse invariant
        // (.claude/rules/06-production-domain.md §12). A genuinely different failure
        // (e.g. COST_LIMIT_EXCEEDED with no race involved) still surfaces correctly,
        // since no matching record will exist to recover here.
        const winner = await generations.byIdempotencyKey(retryKey);
        if (winner) return winner;
        throw error;
      }

      if (source.shotId) {
        const shot = await shots.byId(source.shotId);
        if (shot && shot.status !== 'approved') {
          await shots.update(shot.id, { status: 'generating' });
        }
      }

      await activity.log({
        projectId: source.projectId,
        userId: null,
        action: 'generation.manual-retry',
        targetType: 'generation',
        targetId: retried.id,
        details: { retryOfGenerationId: source.id },
      });

      return retried;
    },

    async cancelPending(id: string): Promise<GenerationRecord> {
      const current = await generations.byId(id);
      if (!current) throw notFound('Generation', id);
      if (current.status !== 'pending') {
        throw new DomainError(
          'JOB_NOT_CANCELLABLE',
          `Generation ${id} is ${current.status}; IA6B can cancel only queued pending jobs.`,
        );
      }
      return createGenerationService(studio).cancel(id);
    },
  };
}

export type GenerationControlService = ReturnType<typeof createGenerationControlService>;
