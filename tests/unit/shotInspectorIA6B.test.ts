import { describe, expect, it } from 'vitest';
import { generationControlMode } from '@/components/shot-inspector/GenerationJobControls';
import generationsSource from '@/components/shot-inspector/GenerationsContent.tsx?raw';
import controlsSource from '@/components/shot-inspector/GenerationJobControls.tsx?raw';
import actionsSource from '@/app/generationActions.ts?raw';
import serviceSource from '@/application/services/generationControlService.ts?raw';

describe('Shot Inspector IA6B — bounded generation controls', () => {
  it('offers retry only for failed jobs and cancel only for pending jobs', () => {
    expect(generationControlMode('failed')).toBe('retry');
    expect(generationControlMode('pending')).toBe('cancel');
    expect(generationControlMode('processing')).toBeNull();
    expect(generationControlMode('completed')).toBeNull();
    expect(generationControlMode('cancelled')).toBeNull();
  });

  it('wires controls into the existing Generations surface without adding queue administration', () => {
    expect(generationsSource).toContain('<GenerationJobControls');
    expect(generationsSource).toContain('retryFailedGenerationAction.bind');
    expect(generationsSource).toContain('cancelPendingGenerationAction.bind');
    expect(generationsSource).toContain('<VideoGenerationConfirmation');
    expect(generationsSource).toContain('prepareVideoGenerationAction.bind');
    expect(generationsSource).toContain('confirmVideoGenerationAction.bind');
    expect(generationsSource).not.toContain('Process queue now');
    expect(generationsSource).not.toContain('priority editor');
    expect(controlsSource).toContain('Retry failed job');
    expect(controlsSource).toContain('Cancel queued job');
    expect(controlsSource).toContain('router.refresh()');
  });

  it('keeps auth, Zod validation and project ownership ahead of generation mutation', () => {
    const authIndex = actionsSource.indexOf('getAuthorizedActionStudio()');
    const parseIndex = actionsSource.indexOf('generationControlActionInputSchema.parse');
    const ownershipIndex = actionsSource.indexOf('generation.projectId !== project.id');
    const retryIndex = actionsSource.indexOf('.retryFailed(');
    const cancelIndex = actionsSource.indexOf('.cancelPending(');

    expect(authIndex).toBeGreaterThan(-1);
    expect(parseIndex).toBeGreaterThan(authIndex);
    expect(ownershipIndex).toBeGreaterThan(parseIndex);
    expect(retryIndex).toBeGreaterThan(ownershipIndex);
    expect(cancelIndex).toBeGreaterThan(ownershipIndex);
    expect(actionsSource).toContain("code: 'VALIDATION_FAILED'");
    expect(actionsSource).toContain("throw new DomainError('NOT_FOUND', 'Generation not found in this project.')");
  });

  it('retries from server-owned stored generation data through the atomic enqueue path', () => {
    expect(serviceSource).toContain("source.status !== 'failed'");
    expect(serviceSource).toContain('manual-retry:${source.id}:${source.attempts}');
    expect(serviceSource).toContain('promptId: source.promptId');
    expect(serviceSource).toContain('promptVersion: source.promptVersion');
    expect(serviceSource).toContain('provider: source.provider');
    expect(serviceSource).toContain('model: source.model');
    expect(serviceSource).toContain('estimatedCostUsd: source.estimatedCostUsd');
    expect(serviceSource).toContain('generations.enqueue(');
    expect(serviceSource).toContain("shot.status !== 'approved'");
    expect(serviceSource).not.toContain('raw.provider');
    expect(serviceSource).not.toContain('raw.model');
  });
});
