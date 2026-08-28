import { DomainError, notFound } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { approvalInputSchema, n8nPublishPayloadSchema, publishRequestSchema } from '@/domain/schemas';
import type { Studio } from '../ports';
import type { ApprovalRecord, ExportRecord, PublishRecord } from '../records';

export const MAX_PUBLISH_ATTEMPTS = 3;

export function createPublishService(studio: Studio) {
  const requireCompletedExport = async (projectId: string, exportId: string): Promise<ExportRecord> => {
    const record = await studio.exports.byId(exportId);
    if (!record) throw notFound('Export', exportId);
    if (record.projectId !== projectId) throw new DomainError('VALIDATION_FAILED', 'Export does not belong to project.');
    if (record.status !== 'completed') throw new DomainError('CONFLICT', 'Only completed exports can be published.');
    return record;
  };

  const requireApprovedExport = async (projectId: string, exportId: string): Promise<ApprovalRecord> => {
    const approvals = await studio.approvals.listForTarget(projectId, 'export', exportId);
    const approved = approvals.find((candidate) => candidate.decision === 'approved' && candidate.decidedBy);
    if (!approved) {
      throw new DomainError(
        'CONFLICT',
        'This export has not been approved by an operator. Approve it before publishing so the delivery is attributable.',
      );
    }
    return approved;
  };

  const attempt = async (record: PublishRecord, exp: ExportRecord): Promise<PublishRecord> => {
    if (record.attemptCount >= MAX_PUBLISH_ATTEMPTS) {
      throw new DomainError('CONFLICT', `Publish retry limit reached (${MAX_PUBLISH_ATTEMPTS} attempts).`);
    }
    let current = await studio.publishes.updateStatus(record.id, 'running');
    current = await studio.publishes.incrementAttempt(current.id);
    try {
      const payload = n8nPublishPayloadSchema.parse({
        projectId: record.projectId,
        exportId: record.exportId,
        downloadUrl: studio.storage.url(exp.storageKey),
        metadata: exp.summary,
      });
      await studio.delivery.deliver(record.endpoint, payload, record.idempotencyKey);
      current = await studio.publishes.updateStatus(record.id, 'completed');
      await studio.activity.log({
        projectId: record.projectId, userId: null, action: 'publish.success', targetType: 'publish', targetId: record.id,
        details: { destinationHost: new URL(record.endpoint).hostname, attempt: current.attemptCount },
      });
      return current;
    } catch (error) {
      const failure = error instanceof DomainError ? error : new DomainError('PROVIDER_REJECTED', 'Publishing delivery failed.');
      current = await studio.publishes.updateStatus(record.id, 'failed', failure.message);
      await studio.activity.log({
        projectId: record.projectId, userId: null, action: 'publish.failed', targetType: 'publish', targetId: record.id,
        details: { code: failure.code, attempt: current.attemptCount },
      });
      throw failure;
    }
  };

  return {
    /**
     * Operator approval path. An export must carry an approved approval
     * decision recorded against a real user before it may be published.
     */
    async approveExport(projectId: string, raw: unknown, decidedBy: string): Promise<ApprovalRecord> {
      const input = approvalInputSchema.parse(raw);
      if (input.targetType !== 'export') {
        throw new DomainError('VALIDATION_FAILED', 'approveExport only records approvals for exports.');
      }
      const exp = await requireCompletedExport(projectId, input.targetId);
      return studio.approvals.record(projectId, {
        targetType: 'export',
        targetId: exp.id,
        decision: input.decision,
        note: input.note,
        decidedBy,
      });
    },

    async publish(raw: unknown): Promise<PublishRecord> {
      const input = publishRequestSchema.parse(raw);
      const exp = await requireCompletedExport(input.projectId, input.exportId);
      await requireApprovedExport(input.projectId, input.exportId);

      const claim = await studio.publishes.claimPublishAttempt({
        ...input,
        idempotencyKey: newId('delivery'),
      });
      
      switch (claim.kind) {
        case 'ALREADY_DELIVERED':
        case 'ALREADY_IN_PROGRESS':
          return claim.record;
        case 'RETRYABLE_EXISTING':
          return attempt(claim.record, exp);
        case 'CLAIMED':
          return attempt(claim.record, exp);
      }
    },

    async retry(id: string): Promise<PublishRecord> {
      const record = await studio.publishes.byId(id);
      if (!record) throw notFound('Publish', id);
      if (record.status !== 'failed') throw new DomainError('CONFLICT', 'Only failed publishes can be retried.');
      const exp = await requireCompletedExport(record.projectId, record.exportId);
      await requireApprovedExport(record.projectId, record.exportId);
      return attempt(record, exp);
    },

    async byId(id: string): Promise<PublishRecord | null> {
      return studio.publishes.byId(id);
    },

    async list(projectId: string): Promise<PublishRecord[]> {
      return studio.publishes.listByProject(projectId);
    },
  };
}
