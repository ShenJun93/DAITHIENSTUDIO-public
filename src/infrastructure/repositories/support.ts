/** Approvals, quality reports, workflow runs, timelines, exports, activity log. */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { newId } from '@/domain/ids';
import { stringify } from '@/domain/json';
import { DomainError, notFound } from '@/domain/errors';
import { approvalStateForDecision, deriveShotStatusAfterAssetDecision } from '@/domain/approval';
import type { AssetApprovalState } from '@/domain/approval';
import type { ShotStatus } from '@/domain/enums';
import type {
  ActivityRepository,
  ApprovalRepository,
  Clock,
  ExportRepository,
  QualityRepository,
  TimelineRepository,
  WorkflowRepository,
} from '@/application/ports';
import type { Db } from '../db/client';
import {
  activityLogs,
  approvals,
  assets,
  exports as exportsTable,
  qualityReports,
  shots,
  timelines,
  workflowRuns,
} from '../db/schema';
import { toActivity, toApproval, toAsset, toExport, toQualityReport, toTimeline, toWorkflowRun } from './mappers';

export function createApprovalRepository(db: Db, clock: Clock): ApprovalRepository {
  return {
    async record(projectId, input) {
      const id = newId('apr');
      db.insert(approvals)
        .values({
          id,
          projectId,
          targetType: input.targetType,
          targetId: input.targetId,
          decision: input.decision,
          note: input.note,
          decidedBy: input.decidedBy,
          createdAt: clock.nowIso(),
        })
        .run();
      const row = db.select().from(approvals).where(eq(approvals.id, id)).get();
      if (!row) throw notFound('Approval', id);
      return toApproval(row);
    },

    async decideAsset(input) {
      return db.transaction((tx) => {
        const currentRow = tx.select().from(assets).where(and(eq(assets.id, input.assetId), isNull(assets.deletedAt))).get();
        if (!currentRow) throw notFound('Asset', input.assetId);
        const current = toAsset(currentRow);
        const targetState = approvalStateForDecision(input.decision);
        const shotRow = current.shotId
          ? tx
              .select()
              .from(shots)
              .where(and(eq(shots.id, current.shotId), eq(shots.projectId, current.projectId)))
              .get()
          : null;
        if (current.shotId && !shotRow) {
          throw new DomainError(
            'CONFLICT',
            `Asset ${current.id} references a shot outside project ${current.projectId}.`,
            { assetId: current.id, projectId: current.projectId, shotId: current.shotId },
          );
        }

        if (current.approvalState === 'approved' && input.decision === 'approved') {
          return {
            asset: current,
            approval: null,
            shotStatus: (shotRow?.status as ShotStatus | undefined) ?? null,
            idempotent: true,
          };
        }
        if (current.approvalState === 'approved') {
          throw new DomainError(
            'IMMUTABLE_APPROVED_ASSET',
            `Asset ${input.assetId} is approved. Create a new version instead of changing the approved one.`,
          );
        }

        const now = clock.nowIso();
        if (current.approvalState !== targetState) {
          tx.update(assets).set({ approvalState: targetState, updatedAt: now }).where(eq(assets.id, input.assetId)).run();
        }

        const approvalId = newId('apr');
        tx.insert(approvals).values({
          id: approvalId,
          projectId: current.projectId,
          targetType: 'asset',
          targetId: current.id,
          decision: input.decision,
          note: input.note,
          decidedBy: input.decidedBy,
          createdAt: now,
        }).run();

        tx.insert(activityLogs).values({
          id: newId('act'),
          projectId: current.projectId,
          userId: input.decidedBy,
          action: `asset.${input.decision}`,
          targetType: 'asset',
          targetId: current.id,
          detailsJson: stringify({ note: input.note }),
          createdAt: now,
        }).run();

        let shotStatus: ShotStatus | null = null;
        if (current.shotId && shotRow) {
          const candidateStates = tx
            .select({ approvalState: assets.approvalState })
            .from(assets)
            .where(and(eq(assets.projectId, current.projectId), eq(assets.shotId, current.shotId), isNull(assets.deletedAt)))
            .all()
            .map((row) => row.approvalState as AssetApprovalState);
          shotStatus = deriveShotStatusAfterAssetDecision(shotRow.status as ShotStatus, candidateStates);
          tx
            .update(shots)
            .set({ status: shotStatus, updatedAt: now })
            .where(and(eq(shots.id, current.shotId), eq(shots.projectId, current.projectId)))
            .run();
        }

        const updatedRow = tx.select().from(assets).where(eq(assets.id, input.assetId)).get();
        const approvalRow = tx.select().from(approvals).where(eq(approvals.id, approvalId)).get();
        if (!updatedRow || !approvalRow) throw notFound('AssetDecision', input.assetId);
        return { asset: toAsset(updatedRow), approval: toApproval(approvalRow), shotStatus, idempotent: false };
      });
    },

    async listForTarget(projectId, targetType, targetId) {
      return db
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.projectId, projectId),
            eq(approvals.targetType, targetType),
            eq(approvals.targetId, targetId),
          ),
        )
        .orderBy(desc(approvals.createdAt))
        .all()
        .map(toApproval);
    },

    async listRecent(projectId, limit) {
      return db
        .select()
        .from(approvals)
        .where(eq(approvals.projectId, projectId))
        .orderBy(desc(approvals.createdAt))
        .limit(limit)
        .all()
        .map(toApproval);
    },
  };
}

export function createQualityRepository(db: Db, clock: Clock): QualityRepository {
  return {
    async save(input) {
      const id = newId('qr');
      db.insert(qualityReports)
        .values({
          id,
          projectId: input.projectId,
          targetType: input.targetType,
          shotId: input.shotId,
          assetId: input.assetId,
          score: input.score,
          passed: input.passed,
          checksJson: stringify(input.checks),
          createdAt: clock.nowIso(),
        })
        .run();
      const row = db.select().from(qualityReports).where(eq(qualityReports.id, id)).get();
      if (!row) throw notFound('QualityReport', id);
      return toQualityReport(row);
    },

    async latestForAsset(assetId) {
      const rows = db
        .select()
        .from(qualityReports)
        .where(eq(qualityReports.assetId, assetId))
        .orderBy(asc(qualityReports.createdAt))
        .all();
      const row = rows.at(-1);
      return row ? toQualityReport(row) : null;
    },

    async listByProject(projectId, limit = 100) {
      return db
        .select()
        .from(qualityReports)
        .where(eq(qualityReports.projectId, projectId))
        .orderBy(desc(qualityReports.createdAt))
        .limit(limit)
        .all()
        .map(toQualityReport);
    },
  };
}

export function createWorkflowRepository(db: Db, clock: Clock): WorkflowRepository {
  const load = (id: string) => {
    const row = db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get();
    if (!row) throw notFound('WorkflowRun', id);
    return toWorkflowRun(row);
  };

  return {
    async start(projectId, workflowKey, input, steps) {
      const id = newId('wfr');
      db.insert(workflowRuns)
        .values({
          id,
          projectId,
          workflowKey,
          status: 'running',
          stepsJson: stringify(steps),
          inputJson: stringify(input),
          outputJson: '{}',
          startedAt: clock.nowIso(),
        })
        .run();
      return load(id);
    },

    async updateSteps(id, steps) {
      load(id);
      db.update(workflowRuns).set({ stepsJson: stringify(steps) }).where(eq(workflowRuns.id, id)).run();
      return load(id);
    },

    async finish(id, status, output, steps) {
      load(id);
      db.update(workflowRuns)
        .set({ status, outputJson: stringify(output), stepsJson: stringify(steps), finishedAt: clock.nowIso() })
        .where(eq(workflowRuns.id, id))
        .run();
      return load(id);
    },

    async byId(id) {
      const row = db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get();
      return row ? toWorkflowRun(row) : null;
    },

    async listByProject(projectId) {
      return db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.projectId, projectId))
        .orderBy(desc(workflowRuns.startedAt))
        .all()
        .map(toWorkflowRun);
    },
  };
}

export function createTimelineRepository(db: Db, clock: Clock): TimelineRepository {
  return {
    async save(projectId, items, name = 'Master timeline', episodeId) {
      const now = clock.nowIso();
      const predicate = episodeId
        ? and(eq(timelines.projectId, projectId), eq(timelines.episodeId, episodeId))
        : and(eq(timelines.projectId, projectId), isNull(timelines.episodeId));
      const existing = db.select().from(timelines).where(predicate).get();
      if (existing) {
        db.update(timelines)
          .set({ itemsJson: stringify(items), name, updatedAt: now })
          .where(eq(timelines.id, existing.id))
          .run();
        const row = db.select().from(timelines).where(eq(timelines.id, existing.id)).get();
        if (!row) throw notFound('Timeline', existing.id);
        return toTimeline(row);
      }
      const id = newId('tl');
      db.insert(timelines)
        .values({ id, projectId, episodeId: episodeId ?? null, name, itemsJson: stringify(items), createdAt: now, updatedAt: now })
        .run();
      const row = db.select().from(timelines).where(eq(timelines.id, id)).get();
      if (!row) throw notFound('Timeline', id);
      return toTimeline(row);
    },

    async current(projectId, episodeId) {
      const predicate = episodeId
        ? and(eq(timelines.projectId, projectId), eq(timelines.episodeId, episodeId))
        : and(eq(timelines.projectId, projectId), isNull(timelines.episodeId));
      const row = db.select().from(timelines).where(predicate).get();
      return row ? toTimeline(row) : null;
    },

    async listByEpisode(projectId, episodeId) {
      return db
        .select()
        .from(timelines)
        .where(and(eq(timelines.projectId, projectId), eq(timelines.episodeId, episodeId)))
        .all()
        .map(toTimeline);
    },
  };
}

export function createExportRepository(db: Db, clock: Clock): ExportRepository {
  return {
    async record(input) {
      const id = newId('exp');
      db.insert(exportsTable)
        .values({
          id,
          projectId: input.projectId,
          kind: input.kind,
          status: 'completed',
          storageKey: input.storageKey,
          frozenVersionsJson: stringify(input.frozenVersions),
          summaryJson: stringify(input.summary),
          createdAt: clock.nowIso(),
        })
        .run();
      const row = db.select().from(exportsTable).where(eq(exportsTable.id, id)).get();
      if (!row) throw notFound('Export', id);
      return toExport(row);
    },

    async listByProject(projectId) {
      return db
        .select()
        .from(exportsTable)
        .where(eq(exportsTable.projectId, projectId))
        .orderBy(desc(exportsTable.createdAt))
        .all()
        .map(toExport);
    },

    async byId(id) {
      const row = db.select().from(exportsTable).where(eq(exportsTable.id, id)).get();
      return row ? toExport(row) : null;
    },
  };
}

export function createActivityRepository(db: Db, clock: Clock): ActivityRepository {
  return {
    async log(input) {
      db.insert(activityLogs)
        .values({
          id: newId('act'),
          projectId: input.projectId,
          userId: input.userId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          detailsJson: stringify(input.details),
          createdAt: clock.nowIso(),
        })
        .run();
    },

    async recent(projectId, limit) {
      const rows = projectId
        ? db
            .select()
            .from(activityLogs)
            .where(eq(activityLogs.projectId, projectId))
            .orderBy(desc(activityLogs.createdAt))
            .limit(limit)
            .all()
        : db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit).all();
      return rows.map(toActivity);
    },
  };
}
