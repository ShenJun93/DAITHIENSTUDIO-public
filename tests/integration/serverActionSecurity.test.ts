import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/domain/errors';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  projectGet: vi.fn(),
  assetDecide: vi.fn(),
  qualityCheck: vi.fn(),
  resolveOperator: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() })),
  headers: vi.fn(async () => ({ get: () => null })),
}));
vi.mock('@/app/_lib/actionAuth', () => ({
  getAuthorizedActionStudio: mocks.authorize,
}));
vi.mock('@/app/_lib/operator', () => ({
  resolveOperatorIdFromRequest: mocks.resolveOperator,
}));
vi.mock('@/application/services/projectService', () => ({
  createProjectService: () => ({ get: mocks.projectGet }),
}));
vi.mock('@/application/services/assetService', () => ({
  createAssetService: () => ({ decide: mocks.assetDecide }),
}));
vi.mock('@/application/services/qualityService', () => ({
  createQualityService: () => ({ checkAsset: mocks.qualityCheck }),
}));

import { checkQualityAction, decideAssetAction } from '@/app/actions';

const ACTIONS_PATH = path.resolve(process.cwd(), 'src/app/actions.ts');

function exportedActionBodies(source: string): Map<string, string> {
  const starts = [...source.matchAll(/^export async function (\w+Action)\s*\(/gm)];
  return new Map(starts.map((match, index) => {
    const next = starts[index + 1];
    return [match[1]!, source.slice(match.index!, next?.index ?? source.length)];
  }));
}

function studioWithAsset(projectId: string): any {
  return {
    assets: { byId: vi.fn(async () => ({ id: 'asset-1', projectId })) },
  };
}

describe('Server Action mutation security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveOperator.mockResolvedValue('operator-1');
    mocks.projectGet.mockResolvedValue({ id: 'project-1', slug: 'project-one' });
    mocks.assetDecide.mockResolvedValue(undefined);
    mocks.qualityCheck.mockResolvedValue({ passed: true, score: 100, checks: [] });
    mocks.authorize.mockResolvedValue(studioWithAsset('project-1'));
  });

  it('guards all 50 mutating exports while leaving prompt inspection read-only', () => {
    const bodies = exportedActionBodies(fs.readFileSync(ACTIONS_PATH, 'utf8'));
    const readOnly = bodies.get('inspectShotPromptAction');
    const mutations = [...bodies.entries()].filter(([name]) => name !== 'inspectShotPromptAction');

    expect(bodies.size).toBe(51);
    expect(mutations).toHaveLength(50);
    expect(mutations.map(([name]) => name)).not.toContain('inspectShotPromptAction');
    for (const [name, body] of mutations) {
      expect(body, `${name} must authorize before mutation`).toContain('getAuthorizedActionStudio(');
    }
    expect(readOnly).toBeDefined();
    expect(readOnly).not.toContain('getAuthorizedActionStudio(');
  });

  it('does not reach asset services when authorization fails', async () => {
    mocks.authorize.mockRejectedValue(new DomainError('UNAUTHORIZED', 'Locked.'));

    const result = await decideAssetAction('project-one', 'asset-1', 'approved', 'ready');

    expect(result).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(mocks.projectGet).not.toHaveBeenCalled();
    expect(mocks.resolveOperator).not.toHaveBeenCalled();
    expect(mocks.assetDecide).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid decision', 'maybe', 'short note'],
    ['note longer than 2000 characters', 'approved', 'x'.repeat(2001)],
  ])('rejects %s before project lookup or asset mutation', async (_label, decision, note) => {
    const result = await decideAssetAction(
      'project-one',
      'asset-1',
      decision as 'approved',
      note,
    );

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.projectGet).not.toHaveBeenCalled();
    expect(mocks.resolveOperator).not.toHaveBeenCalled();
    expect(mocks.assetDecide).not.toHaveBeenCalled();
  });

  it('rejects a cross-project asset decision without recording a write', async () => {
    mocks.authorize.mockResolvedValue(studioWithAsset('project-2'));

    const result = await decideAssetAction('project-one', 'asset-1', 'approved', 'ready');

    expect(result.ok).toBe(false);
    expect(mocks.resolveOperator).not.toHaveBeenCalled();
    expect(mocks.assetDecide).not.toHaveBeenCalled();
  });

  it('rejects a cross-project quality check without creating a quality record', async () => {
    mocks.authorize.mockResolvedValue(studioWithAsset('project-2'));

    const result = await checkQualityAction('project-one', 'asset-1');

    expect(result.ok).toBe(false);
    expect(mocks.qualityCheck).not.toHaveBeenCalled();
  });

  it('rejects a malformed quality-check asset id before project lookup or write', async () => {
    const result = await checkQualityAction('project-one', '');

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.projectGet).not.toHaveBeenCalled();
    expect(mocks.qualityCheck).not.toHaveBeenCalled();
  });

  it('allows authorized, validated asset decision and quality mutations', async () => {
    const decision = await decideAssetAction('project-one', 'asset-1', 'approved', 'ready');
    const quality = await checkQualityAction('project-one', 'asset-1');

    expect(decision.ok).toBe(true);
    expect(quality.ok).toBe(true);
    expect(mocks.assetDecide).toHaveBeenCalledWith('asset-1', 'approved', 'ready', 'operator-1');
    expect(mocks.qualityCheck).toHaveBeenCalledWith('asset-1');
  });
});
