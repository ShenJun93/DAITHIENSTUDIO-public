/**
 * Generation worker.
 *
 * Claims pending jobs one at a time (up to `maxConcurrentJobs`), executes them
 * and records the outcome. Failures are classified: a validation or safety
 * rejection is terminal, transport problems are retried with backoff.
 *
 * `drain()` exists so tests and `npm run demo` can process the queue to
 * completion without a polling loop.
 */
import { ProviderError, isRetryable } from '../providers/retry';
import { createGenerationService } from '@/application/services/generationService';
import { DomainError } from '@/domain/errors';
import type { Studio } from '@/application/ports';

export interface WorkerOptions {
  workerId: string;
  pollIntervalMs?: number;
  maxIterations?: number;
}

export function createWorker(studio: Studio, options: WorkerOptions) {
  const generationService = createGenerationService(studio);
  const { generations, shots, logger, config } = studio;
  let stopped = false;

  async function runOne(): Promise<boolean> {
    // Recover jobs whose worker died while holding the lock.
    const staleBefore = new Date(Date.now() - config.jobTimeoutMs).toISOString();
    const released = await generations.releaseStale(staleBefore);
    if (released > 0) logger.warn(`[worker] released ${released} stale job(s)`);

    const job = await generations.claimNext(options.workerId, new Date().toISOString());
    if (!job) return false;

    logger.info(`[worker] ${job.id} ${job.kind} via ${job.provider}/${job.model} (attempt ${job.attempts})`);

    try {
      const result = await generationService.execute(job);
      logger.info(`[worker] ${job.id} completed with ${result.assetIds.length} asset(s)`);
    } catch (error) {
      const failure =
        error instanceof ProviderError
          ? error.failure
          : error instanceof DomainError
            ? { errorClass: 'validation' as const, code: error.code, message: error.message }
            : { errorClass: 'retryable' as const, code: 'INTERNAL', message: 'Generation failed unexpectedly' };

      const retry = isRetryable(failure);
      await generations.fail(job.id, { errorCode: failure.code, errorMessage: failure.message, retry });
      if (!retry && job.shotId) {
        const shot = await shots.byId(job.shotId);
        if (shot) await shots.update(shot.id, { status: 'rejected' });
      }
      logger.error(`[worker] ${job.id} failed (${failure.code}, retry=${retry}): ${failure.message}`);
    }
    return true;
  }

  return {
    runOne,

    /** Processes everything currently pending, then returns. */
    async drain(limit = 200): Promise<number> {
      let processed = 0;
      while (processed < limit) {
        const didWork = await runOne();
        if (!didWork) break;
        processed += 1;
      }
      return processed;
    },

    /** Long-running loop for `npm run worker`. */
    async start(): Promise<void> {
      const interval = options.pollIntervalMs ?? 1_500;
      let iterations = 0;
      logger.info(`[worker] ${options.workerId} started (poll ${interval}ms)`);
      while (!stopped) {
        if (options.maxIterations && iterations >= options.maxIterations) break;
        iterations += 1;
        const didWork = await runOne();
        if (!didWork) await new Promise((resolve) => setTimeout(resolve, interval));
      }
      logger.info(`[worker] ${options.workerId} stopped`);
    },

    stop(): void {
      stopped = true;
    },
  };
}
