import { describe, expect, it, vi } from 'vitest';
import type { Studio } from '@/application/ports';
import { createPromptApprovalService } from '@/application/services/promptApprovalService';

function makeStudio() {
  const shot = { id: 'shot_1', projectId: 'project_1' };
  const prompt = { id: 'prompt_1', shotId: shot.id, projectId: shot.projectId, kind: 'image' };
  const version = { version: 7 };
  const approval = {
    id: 'approval_1',
    projectId: shot.projectId,
    targetType: 'prompt',
    targetId: 'prompt_1@7',
    decision: 'approved',
    note: 'Prompt reviewed.',
    decidedBy: 'operator_1',
    createdAt: '2026-08-11T06:00:00.000Z',
  };

  const studio = {
    shots: { byId: vi.fn(async () => shot) },
    prompts: {
      findForShot: vi.fn(async () => prompt),
      latestVersion: vi.fn(async () => version),
      version: vi.fn(async (_promptId: string, requested: number) => (requested === 7 ? version : null)),
      versions: vi.fn(async () => [version]),
    },
    approvals: {
      listForTarget: vi.fn(async () => [approval]),
      record: vi.fn(async (_projectId: string, input: any) => ({ ...approval, ...input })),
    },
    generations: {
      enqueue: vi.fn(),
      create: vi.fn(),
    },
  } as unknown as Studio;

  return { studio, approval };
}

describe('Prompt approval service (VC5)', () => {
  it('Approve the exact current prompt version', async () => {
    const { studio } = makeStudio();
    const service = createPromptApprovalService(studio);

    await service.decideVersion('project_1', 'shot_1', 'image', 7, 'approved', 'Prompt reviewed.', 'operator_1');

    expect(studio.prompts.latestVersion).toHaveBeenCalledWith('prompt_1');
    expect(studio.prompts.version).toHaveBeenCalledWith('prompt_1', 7);
    expect(studio.approvals.record).toHaveBeenCalledWith('project_1', {
      targetType: 'prompt',
      targetId: 'prompt_1@7',
      decision: 'approved',
      note: 'Prompt reviewed.',
      decidedBy: 'operator_1',
    });
  });

  it('Reject or request changes', async () => {
    for (const decision of ['rejected', 'changes-requested'] as const) {
      const { studio } = makeStudio();
      const service = createPromptApprovalService(studio);

      await service.decideVersion('project_1', 'shot_1', 'image', 7, decision, 'Review note', 'operator_1');

      expect(studio.approvals.record).toHaveBeenCalledWith(
        'project_1',
        expect.objectContaining({ targetType: 'prompt', targetId: 'prompt_1@7', decision }),
      );
    }
  });

  it('appends repeated decisions instead of introducing an overwrite path', async () => {
    const { studio } = makeStudio();
    const service = createPromptApprovalService(studio);

    await service.decideVersion('project_1', 'shot_1', 'image', 7, 'approved', 'first', 'operator_1');
    await service.decideVersion('project_1', 'shot_1', 'image', 7, 'rejected', 'second', 'operator_1');

    expect(studio.approvals.record).toHaveBeenCalledTimes(2);
  });

  it('reads approval history only for the exact current prompt version target', async () => {
    const { studio, approval } = makeStudio();
    const service = createPromptApprovalService(studio);

    await expect(service.latestForShot('project_1', 'shot_1', 'image')).resolves.toEqual({
      promptId: 'prompt_1',
      version: 7,
      targetId: 'prompt_1@7',
      latest: approval,
      history: [approval],
    });
    expect(studio.approvals.listForTarget).toHaveBeenCalledWith('project_1', 'prompt', 'prompt_1@7');
    expect(studio.approvals.record).not.toHaveBeenCalled();
  });

  it('New prompt version makes prior evidence stale by derivation', async () => {
    const { studio, approval } = makeStudio();
    vi.mocked(studio.prompts.latestVersion).mockResolvedValue({ version: 8 } as any);
    vi.mocked(studio.prompts.versions).mockResolvedValue([{ version: 7 }, { version: 8 }] as any);
    vi.mocked(studio.approvals.listForTarget).mockImplementation(async (_projectId, _targetType, targetId) =>
      targetId === 'prompt_1@7' ? [approval as any] : [],
    );
    const service = createPromptApprovalService(studio);

    const result = await service.reviewForShot('project_1', 'shot_1', 'image');

    expect(result?.version).toBe(8);
    expect(result?.latest).toBeNull();
    expect(result?.stalePrior).toEqual({ version: 7, decision: approval });
    expect(studio.approvals.record).not.toHaveBeenCalled();
  });

  it('Ownership and identifiers remain server authoritative', async () => {
    const { studio } = makeStudio();
    const service = createPromptApprovalService(studio);

    await expect(
      service.decideVersion('project_other', 'shot_1', 'image', 7, 'approved', '', 'operator_1'),
    ).rejects.toThrow();
    await expect(
      service.decideVersion('project_1', 'shot_1', 'image', 999, 'approved', '', 'operator_1'),
    ).rejects.toThrow();
    expect(studio.approvals.record).not.toHaveBeenCalled();
  });

  it('rejects a stale-but-existing prompt version before approval mutation', async () => {
    const { studio } = makeStudio();
    vi.mocked(studio.prompts.latestVersion).mockResolvedValue({ version: 8 } as any);
    vi.mocked(studio.prompts.version).mockImplementation(async (_promptId, requested) =>
      requested === 7 ? ({ version: 7 } as any) : requested === 8 ? ({ version: 8 } as any) : null,
    );
    const service = createPromptApprovalService(studio);

    await expect(
      service.decideVersion('project_1', 'shot_1', 'image', 7, 'approved', '', 'operator_1'),
    ).rejects.toThrow();
    expect(studio.approvals.record).not.toHaveBeenCalled();
  });

  it('Viewing and deciding have no generation side effects', async () => {
    const { studio } = makeStudio();
    const service = createPromptApprovalService(studio);

    await service.latestForShot('project_1', 'shot_1', 'image');
    await service.decideVersion('project_1', 'shot_1', 'image', 7, 'approved', '', 'operator_1');

    expect((studio.generations as any).enqueue).not.toHaveBeenCalled();
    expect((studio.generations as any).create).not.toHaveBeenCalled();
  });
});
