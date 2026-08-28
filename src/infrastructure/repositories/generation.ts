/**
 * Prompt, generation-queue and asset repositories.
 *
 * The queue claim is the interesting part: `claimNext` uses a single
 * conditional UPDATE so two workers can never take the same job, which is the
 * only concurrency guarantee SQLite gives cheaply.
 */
import { and, asc, desc, eq, inArray, isNull, like, lt, or, sql } from 'drizzle-orm';
import { newId } from '@/domain/ids';
import { stringify } from '@/domain/json';
import { DomainError, notFound } from '@/domain/errors';
import type { AssetRepository, Clock, GenerationRepository, PromptRepository } from '@/application/ports';
import type {
  AssetRecord,
  AssetRelationRecord,
  GenerationRecord,
  PromptRecord,
  PromptVersionRecord,
} from '@/application/records';
import type { Db } from '../db/client';
import { assetRelations, assets, generations, promptVersions, prompts } from '../db/schema';
import { toAsset, toAssetRelation, toGeneration, toPrompt, toPromptVersion } from './mappers';

export function createPromptRepository(db: Db, clock: Clock): PromptRepository {
  const loadPrompt = (id: string): PromptRecord => {
    const row = db.select().from(prompts).where(eq(prompts.id, id)).get();
    if (!row) throw notFound('Prompt', id);
    return toPrompt(row);
  };

  const insertVersion = (promptId: string, version: number, input: {
    blocks: unknown;
    compiled: string;
    negative: string;
    lockRefs: unknown;
    lint: unknown;
  }): PromptVersionRecord => {
    const id = newId('pv');
    db.insert(promptVersions)
      .values({
        id,
        promptId,
        version,
        blocksJson: stringify(input.blocks),
        compiled: input.compiled,
        negative: input.negative,
        lockRefsJson: stringify(input.lockRefs),
        lintJson: stringify(input.lint),
        createdAt: clock.nowIso(),
      })
      .run();
    const row = db.select().from(promptVersions).where(eq(promptVersions.id, id)).get();
    if (!row) throw notFound('PromptVersion', id);
    return toPromptVersion(row);
  };

  return {
    async createWithVersion(input) {
      const now = clock.nowIso();
      const promptId = newId('prm');
      db.insert(prompts)
        .values({
          id: promptId,
          projectId: input.projectId,
          shotId: input.shotId,
          kind: input.kind,
          name: input.name,
          currentVersion: 1,
          status: input.lint && typeof input.lint === 'object' && 'ok' in input.lint && input.lint.ok ? 'linted' : 'draft',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const version = insertVersion(promptId, 1, input);
      return { prompt: loadPrompt(promptId), version };
    },

    async addVersion(promptId, input) {
      const current = loadPrompt(promptId);
      const nextVersion = current.currentVersion + 1;
      const version = insertVersion(promptId, nextVersion, input);
      db.update(prompts)
        .set({
          currentVersion: nextVersion,
          status: input.lint.ok ? 'linted' : 'draft',
          updatedAt: clock.nowIso(),
        })
        .where(eq(prompts.id, promptId))
        .run();
      return version;
    },

    async byId(id) {
      const row = db.select().from(prompts).where(eq(prompts.id, id)).get();
      return row ? toPrompt(row) : null;
    },

    async listByShot(shotId) {
      return db.select().from(prompts).where(eq(prompts.shotId, shotId)).orderBy(asc(prompts.kind)).all().map(toPrompt);
    },

    async listByProject(projectId) {
      return db
        .select()
        .from(prompts)
        .where(eq(prompts.projectId, projectId))
        .orderBy(asc(prompts.createdAt))
        .all()
        .map(toPrompt);
    },

    async versions(promptId) {
      return db
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, promptId))
        .orderBy(asc(promptVersions.version))
        .all()
        .map(toPromptVersion);
    },

    async version(promptId, version) {
      const row = db
        .select()
        .from(promptVersions)
        .where(and(eq(promptVersions.promptId, promptId), eq(promptVersions.version, version)))
        .get();
      return row ? toPromptVersion(row) : null;
    },

    async latestVersion(promptId) {
      const rows = db
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, promptId))
        .orderBy(asc(promptVersions.version))
        .all();
      const row = rows.at(-1);
      return row ? toPromptVersion(row) : null;
    },

    async findForShot(shotId, kind) {
      const row = db
        .select()
        .from(prompts)
        .where(and(eq(prompts.shotId, shotId), eq(prompts.kind, kind)))
        .get();
      return row ? toPrompt(row) : null;
    },

    async countByLockRef(versionId) {
      const row = db
        .select({ count: sql<number>`count(*)` })
        .from(promptVersions)
        .where(like(promptVersions.lockRefsJson, `%${versionId}%`))
        .get();
      return row?.count ?? 0;
    },
  };
}

export function createGenerationRepository(db: Db, clock: Clock): GenerationRepository {
  const load = (id: string): GenerationRecord => {
    const row = db.select().from(generations).where(eq(generations.id, id)).get();
    if (!row) throw notFound('Generation', id);
    return toGeneration(row);
  };

  /**
   * Budget spoken for against the project ceiling: completed jobs count their
   * actual cost, pending/processing jobs count their reserved estimate, and
   * failed/cancelled jobs count nothing (their reserve was released). This is
   * what the enqueue ceiling check must read, not `spentUsd`.
   *
   * Runs on the same synchronous better-sqlite3 connection, so when called
   * inside `db.transaction` the read participates in the open transaction.
   */
  const encumberedSpend = (projectId: string): number => {
    const row = db
      .select({
        total: sql<number>`coalesce(sum(case when ${generations.status} = 'completed' then ${generations.actualCostUsd} when ${generations.status} in ('pending', 'processing') then ${generations.estimatedCostUsd} else 0 end), 0)`,
      })
      .from(generations)
      .where(eq(generations.projectId, projectId))
      .get();
    return Number(row?.total ?? 0);
  };

  return {
    async enqueue(input, ceiling) {
      // Atomic reserve: the ceiling check and the INSERT share one transaction,
      // so two concurrent enqueues can never both commit past the ceiling.
      return db.transaction(() => {
        const reserved = encumberedSpend(input.projectId);
        if (input.estimatedCostUsd > 0 && reserved + input.estimatedCostUsd > ceiling) {
          throw new DomainError(
            'COST_LIMIT_EXCEEDED',
            `This generation would cost about $${input.estimatedCostUsd.toFixed(4)} and take the project past its $${ceiling} ceiling (already reserved/spent $${reserved.toFixed(4)}). Raise the limit in project settings or switch to the mock provider.`,
            { spent: reserved, estimatedCostUsd: input.estimatedCostUsd, ceiling },
          );
        }

        const now = clock.nowIso();
        const id = newId('gen');
        db.insert(generations)
          .values({
            id,
            projectId: input.projectId,
            shotId: input.shotId,
            promptId: input.promptId,
            promptVersion: input.promptVersion,
            kind: input.kind,
            provider: input.provider,
            model: input.model,
            prompt: input.prompt,
            negativePrompt: input.negativePrompt,
            paramsJson: stringify(input.params),
            referenceAssetsJson: stringify(input.referenceAssetIds),
            seed: input.seed,
            status: 'pending',
            priority: input.priority,
            attempts: 0,
            maxAttempts: input.maxAttempts,
            scheduledAt: input.scheduledAt || now,
            estimatedCostUsd: input.estimatedCostUsd,
            actualCostUsd: 0,
            rawResponseJson: '{}',
            idempotencyKey: input.idempotencyKey,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        return load(id);
      });
    },

    async byId(id) {
      const row = db.select().from(generations).where(eq(generations.id, id)).get();
      return row ? toGeneration(row) : null;
    },

    async byIdempotencyKey(key) {
      const row = db.select().from(generations).where(eq(generations.idempotencyKey, key)).get();
      return row ? toGeneration(row) : null;
    },

    async listByProject(projectId, options) {
      const rows = options?.status
        ? db
            .select()
            .from(generations)
            .where(and(eq(generations.projectId, projectId), eq(generations.status, options.status)))
            .orderBy(desc(generations.createdAt))
            .all()
        : db
            .select()
            .from(generations)
            .where(eq(generations.projectId, projectId))
            .orderBy(desc(generations.createdAt))
            .all();
      return rows.slice(0, options?.limit ?? 100).map(toGeneration);
    },

    async listByShot(shotId) {
      return db
        .select()
        .from(generations)
        .where(eq(generations.shotId, shotId))
        .orderBy(desc(generations.createdAt))
        .all()
        .map(toGeneration);
    },

    /**
     * Atomic claim. The WHERE clause re-checks `status = 'pending'`, so if two
     * workers race, exactly one UPDATE affects a row.
     */
    async claimNext(workerId, nowIso) {
      const candidate = db
        .select({ id: generations.id })
        .from(generations)
        .where(and(eq(generations.status, 'pending'), lt(generations.scheduledAt, nowIso)))
        .orderBy(asc(generations.priority), asc(generations.scheduledAt))
        .limit(1)
        .get();
      if (!candidate) return null;

      const result = db
        .update(generations)
        .set({
          status: 'processing',
          lockedAt: nowIso,
          lockedBy: workerId,
          startedAt: nowIso,
          attempts: sql`${generations.attempts} + 1`,
          updatedAt: nowIso,
        })
        .where(and(eq(generations.id, candidate.id), eq(generations.status, 'pending')))
        .run();

      if (result.changes === 0) return null;
      return load(candidate.id);
    },

    async markProcessing(id, workerId) {
      const now = clock.nowIso();
      db.update(generations)
        .set({ status: 'processing', lockedBy: workerId, lockedAt: now, startedAt: now, updatedAt: now })
        .where(eq(generations.id, id))
        .run();
    },

    async complete(id, input) {
      const now = clock.nowIso();
      db.update(generations)
        .set({
          status: 'completed',
          finishedAt: now,
          actualCostUsd: input.actualCostUsd,
          rawResponseJson: stringify(input.raw),
          errorCode: null,
          errorMessage: null,
          lockedAt: null,
          lockedBy: null,
          updatedAt: now,
        })
        .where(eq(generations.id, id))
        .run();
      return load(id);
    },

    async fail(id, input) {
      const current = load(id);
      const now = clock.nowIso();
      const canRetry = input.retry && current.attempts < current.maxAttempts;
      // Exponential backoff: 30s, 60s, 120s …
      const delayMs = 30_000 * 2 ** Math.max(0, current.attempts - 1);
      db.update(generations)
        .set({
          status: canRetry ? 'pending' : 'failed',
          errorCode: input.errorCode,
          errorMessage: input.errorMessage.slice(0, 2000),
          finishedAt: canRetry ? null : now,
          scheduledAt: canRetry ? new Date(Date.parse(now) + delayMs).toISOString() : current.scheduledAt,
          lockedAt: null,
          lockedBy: null,
          updatedAt: now,
        })
        .where(eq(generations.id, id))
        .run();
      return load(id);
    },

    async cancel(id) {
      // Cancellation is a queued-job operation. Re-check `pending` in the
      // UPDATE itself so a worker claim that wins the race cannot be cancelled
      // after it has already transitioned the job to processing.
      const now = clock.nowIso();
      const result = db
        .update(generations)
        .set({ status: 'cancelled', finishedAt: now, lockedAt: null, lockedBy: null, updatedAt: now })
        .where(and(eq(generations.id, id), eq(generations.status, 'pending')))
        .run();
      if (result.changes === 0) {
        const current = load(id);
        throw new DomainError(
          'JOB_NOT_CANCELLABLE',
          `Generation ${id} is ${current.status} and cannot be cancelled unless it is pending.`,
        );
      }
      return load(id);
    },

    /** Releases jobs whose worker died holding the lock. */
    async releaseStale(olderThanIso) {
      const result = db
        .update(generations)
        .set({ status: 'pending', lockedAt: null, lockedBy: null, updatedAt: clock.nowIso() })
        .where(and(eq(generations.status, 'processing'), lt(generations.lockedAt, olderThanIso)))
        .run();
      return result.changes;
    },

    async spentUsd(projectId) {
      const row = db
        .select({ total: sql<number>`coalesce(sum(${generations.actualCostUsd}), 0)` })
        .from(generations)
        .where(eq(generations.projectId, projectId))
        .get();
      return Number(row?.total ?? 0);
    },

    async encumberedUsd(projectId) {
      return encumberedSpend(projectId);
    },

    async countByStatus(projectId) {
      const rows = projectId
        ? db
            .select({ status: generations.status, total: sql<number>`count(*)` })
            .from(generations)
            .where(eq(generations.projectId, projectId))
            .groupBy(generations.status)
            .all()
        : db
            .select({ status: generations.status, total: sql<number>`count(*)` })
            .from(generations)
            .groupBy(generations.status)
            .all();
      return Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
    },
  };
}

export function createAssetRepository(db: Db, clock: Clock): AssetRepository {
  const load = (id: string): AssetRecord => {
    const row = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!row) throw notFound('Asset', id);
    return toAsset(row);
  };

  return {
    async register(input) {
      const now = clock.nowIso();
      const id = newId('ast');
      db.insert(assets)
        .values({
          id,
          projectId: input.projectId,
          shotId: input.shotId,
          generationId: input.generationId,
          kind: input.kind,
          name: input.name,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          checksum: input.checksum,
          width: input.width,
          height: input.height,
          durationSeconds: input.durationSeconds,
          tagsJson: stringify(input.tags),
          metadataJson: stringify(input.metadata),
          version: input.version ?? 1,
          favorite: false,
          rating: null,
          approvalState: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return load(id);
    },

    async byId(id) {
      const row = db.select().from(assets).where(eq(assets.id, id)).get();
      return row && !row.deletedAt ? toAsset(row) : null;
    },

    async byChecksum(projectId, checksum) {
      const row = db
        .select()
        .from(assets)
        .where(and(eq(assets.projectId, projectId), eq(assets.checksum, checksum), isNull(assets.deletedAt)))
        .get();
      return row ? toAsset(row) : null;
    },

    async list(projectId, filter) {
      const conditions = [eq(assets.projectId, projectId), isNull(assets.deletedAt)];
      if (filter?.kind) conditions.push(eq(assets.kind, filter.kind));
      if (filter?.shotId) conditions.push(eq(assets.shotId, filter.shotId));
      if (filter?.approvalState) conditions.push(eq(assets.approvalState, filter.approvalState));
      if (filter?.search) {
        const term = `%${filter.search.toLowerCase()}%`;
        const match = or(like(sql`lower(${assets.name})`, term), like(sql`lower(${assets.tagsJson})`, term));
        if (match) conditions.push(match);
      }

      const rows = db
        .select()
        .from(assets)
        .where(and(...conditions))
        .orderBy(desc(assets.createdAt))
        .all();
      const offset = filter?.offset ?? 0;
      return rows.slice(offset, offset + (filter?.limit ?? 100)).map(toAsset);
    },

    async listByGeneration(generationId) {
      return db
        .select()
        .from(assets)
        .where(and(eq(assets.generationId, generationId), isNull(assets.deletedAt)))
        .all()
        .map(toAsset);
    },

    /**
     * Approval is the point of no return: an approved asset must never be
     * edited afterwards, so a second attempt to change state is rejected.
     */
    async setApproval(id, state) {
      const current = load(id);
      if (current.approvalState === 'approved' && state !== 'approved') {
        throw new DomainError(
          'IMMUTABLE_APPROVED_ASSET',
          `Asset ${id} is approved. Create a new version instead of changing the approved one.`,
        );
      }
      db.update(assets).set({ approvalState: state, updatedAt: clock.nowIso() }).where(eq(assets.id, id)).run();
      return load(id);
    },

    async setFavorite(id, favorite) {
      load(id);
      db.update(assets).set({ favorite, updatedAt: clock.nowIso() }).where(eq(assets.id, id)).run();
      return load(id);
    },

    async softDelete(id) {
      const current = load(id);
      if (current.approvalState === 'approved') {
        throw new DomainError('IMMUTABLE_APPROVED_ASSET', `Asset ${id} is approved and cannot be deleted.`);
      }
      db.update(assets).set({ deletedAt: clock.nowIso(), updatedAt: clock.nowIso() }).where(eq(assets.id, id)).run();
    },

    async detachFromShot(id) {
      load(id);
      db.update(assets).set({ shotId: null, updatedAt: clock.nowIso() }).where(eq(assets.id, id)).run();
    },

    async link(parentId, childId, relation): Promise<AssetRelationRecord> {
      const existing = db
        .select()
        .from(assetRelations)
        .where(
          and(
            eq(assetRelations.parentId, parentId),
            eq(assetRelations.childId, childId),
            eq(assetRelations.relation, relation),
          ),
        )
        .get();
      if (existing) return toAssetRelation(existing);

      const id = newId('rel');
      db.insert(assetRelations)
        .values({ id, parentId, childId, relation, createdAt: clock.nowIso() })
        .run();
      const row = db.select().from(assetRelations).where(eq(assetRelations.id, id)).get();
      if (!row) throw notFound('AssetRelation', id);
      return toAssetRelation(row);
    },

    async parents(assetId) {
      return db.select().from(assetRelations).where(eq(assetRelations.childId, assetId)).all().map(toAssetRelation);
    },

    async children(assetId) {
      return db.select().from(assetRelations).where(eq(assetRelations.parentId, assetId)).all().map(toAssetRelation);
    },

    async countByKind(projectId) {
      const rows = db
        .select({ kind: assets.kind, total: sql<number>`count(*)` })
        .from(assets)
        .where(and(eq(assets.projectId, projectId), isNull(assets.deletedAt)))
        .groupBy(assets.kind)
        .all();
      return Object.fromEntries(rows.map((row) => [row.kind, Number(row.total)]));
    },
  };
}

export { inArray };
