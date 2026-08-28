import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/domain/errors';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  projectGet: vi.fn(),
  generationById: vi.fn(),
  shotById: vi.fn(),
  retryFailed: vi.fn(),
  cancelPending: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/_lib/actionAuth', () => ({
  getAuthorizedActionStudio: mocks.authorize,
}));
vi.mock('@/application/services/projectService', () => ({
  createProjectService: () => ({ get: mocks.projectGet }),
}));
vi.mock('@/application/services/generationControlService', () => ({
  createGenerationControlService: () => ({
    retryFailed: mocks.retryFailed,
    cancelPending: mocks.cancelPending,
  }),
}));

import { cancelPendingGenerationAction, retryFailedGenerationAction } from '@/app/generationActions';

function studio() {
  return {
    generations: { byId: mocks.generationById },
    shots: { byId: mocks.shotById },
  };
}

describe('IA6B Server Action security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(studio());
    mocks.projectGet.mockResolvedValue({ id: 'project-1', slug: 'project-one' });
    mocks.generationById.mockResolvedValue({ id: 'gen-1', projectId: 'project-1', shotId: 'shot-1' });
    mocks.shotById.mockResolvedValue({ id: 'shot-1', projectId: 'project-1' });
    mocks.retryFailed.mockResolvedValue({ id: 'gen-retry-1' });
    mocks.cancelPending.mockResolvedValue({ id: 'gen-1', status: 'cancelled' });
  });

  it('does not read or mutate generation state when authorization fails', async () => {
    mocks.authorize.mockRejectedValue(new DomainError('UNAUTHORIZED', 'Locked.'));

    const retry = await retryFailedGenerationAction('project-one', 'gen-1');
    const cancel = await cancelPendingGenerationAction('project-one', 'gen-1');

    expect(retry).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(cancel).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(mocks.projectGet).not.toHaveBeenCalled();
    expect(mocks.generationById).not.toHaveBeenCalled();
    expect(mocks.retryFailed).not.toHaveBeenCalled();
    expect(mocks.cancelPending).not.toHaveBeenCalled();
  });

  it('rejects malformed generation ids before project or generation lookup', async () => {
    const retry = await retryFailedGenerationAction('project-one', '');
    const cancel = await cancelPendingGenerationAction('project-one', '');

    expect(retry).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(cancel).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(mocks.projectGet).not.toHaveBeenCalled();
    expect(mocks.generationById).not.toHaveBeenCalled();
  });

  it('rejects a cross-project generation before retry or cancel mutation', async () => {
    mocks.generationById.mockResolvedValue({ id: 'gen-1', projectId: 'project-2', shotId: null });

    const retry = await retryFailedGenerationAction('project-one', 'gen-1');
    const cancel = await cancelPendingGenerationAction('project-one', 'gen-1');

    expect(retry).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(cancel).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(mocks.retryFailed).not.toHaveBeenCalled();
    expect(mocks.cancelPending).not.toHaveBeenCalled();
  });

  it('rejects a generation whose referenced shot is outside the caller project', async () => {
    mocks.shotById.mockResolvedValue({ id: 'shot-1', projectId: 'project-2' });

    const result = await retryFailedGenerationAction('project-one', 'gen-1');

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(mocks.retryFailed).not.toHaveBeenCalled();
  });

  it('allows authorized same-project retry and cancel with only server-owned generation ids', async () => {
    const retry = await retryFailedGenerationAction('project-one', 'gen-1');
    const cancel = await cancelPendingGenerationAction('project-one', 'gen-1');

    expect(retry.ok).toBe(true);
    expect(cancel.ok).toBe(true);
    expect(mocks.retryFailed).toHaveBeenCalledWith('gen-1');
    expect(mocks.cancelPending).toHaveBeenCalledWith('gen-1');
  });
});
