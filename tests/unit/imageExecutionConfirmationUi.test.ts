import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ImageGenerationConfirmationView,
  imageExecutionConfirmationReducer,
  initialImageExecutionConfirmationState,
  type ImageExecutionConfirmationState,
} from '@/components/shot-inspector/ImageGenerationConfirmation';
import generationsSource from '@/components/shot-inspector/GenerationsContent.tsx?raw';
import shotPageSource from '@/app/projects/[slug]/shots/[code]/page.tsx?raw';

const prepared = {
  confirmationToken: 'opaque-token',
  expiresAt: '2026-08-13T15:00:00.000Z',
  preview: {
    projectId: 'project-1',
    productionType: 'youtube-short',
    shotId: 'shot-1',
    promptId: 'prompt-1',
    promptVersion: 4,
    provider: 'mock',
    model: 'mock-image-v1',
    prompt: 'Resolved image prompt',
    negativePrompt: 'blur, watermark',
    estimatedCostUsd: 0.0123,
    seed: 42,
    params: { count: 1 },
    referenceAssetIds: ['asset-ref-1', 'asset-ref-2'],
    priority: 50,
    warnings: ['Continuity warning'],
  },
};

function render(state: ImageExecutionConfirmationState, reused = false): string {
  return renderToStaticMarkup(
    createElement(ImageGenerationConfirmationView, {
      state,
      reused,
      onPrepare: () => undefined,
      onConfirm: () => undefined,
    }),
  );
}

describe('safe image execution confirmation UI state', () => {
  it('starts IDLE and cannot confirm before Prepare', () => {
    expect(initialImageExecutionConfirmationState.phase).toBe('IDLE');
    expect(
      imageExecutionConfirmationReducer(initialImageExecutionConfirmationState, { type: 'CONFIRM_STARTED' }),
    ).toEqual(initialImageExecutionConfirmationState);
  });

  it('requires Prepare before explicit Confirm', () => {
    const preparing = imageExecutionConfirmationReducer(
      initialImageExecutionConfirmationState,
      { type: 'PREPARE_STARTED' },
    );
    expect(preparing.phase).toBe('PREPARING');

    const awaiting = imageExecutionConfirmationReducer(preparing, {
      type: 'PREPARE_SUCCEEDED',
      prepared,
    });
    expect(awaiting).toMatchObject({ phase: 'AWAITING_CONFIRMATION', prepared });

    const confirming = imageExecutionConfirmationReducer(awaiting, { type: 'CONFIRM_STARTED' });
    expect(confirming.phase).toBe('CONFIRMING');

    const enqueued = imageExecutionConfirmationReducer(confirming, {
      type: 'CONFIRM_SUCCEEDED',
      generationId: 'generation-1',
    });
    expect(enqueued).toMatchObject({ phase: 'ENQUEUED', generationId: 'generation-1' });
  });

  it.each(['CONFIRMATION_EXPIRED', 'CONFIRMATION_STALE'] as const)(
    '%s clears the review and requires Prepare again',
    (code) => {
      const state = imageExecutionConfirmationReducer(
        { phase: 'AWAITING_CONFIRMATION', prepared, generationId: null, error: null },
        { type: 'CONFIRM_STARTED' },
      );
      const failed = imageExecutionConfirmationReducer(state, {
        type: 'FAILED',
        code,
        message: 'Prepare again.',
      });
      expect(failed).toEqual({
        phase: 'IDLE',
        prepared: null,
        generationId: null,
        error: { code, message: 'Prepare again.' },
      });
    },
  );
});

describe('safe image execution confirmation UI view', () => {
  it('offers Prepare first and does not expose Confirm while IDLE', () => {
    const html = render(initialImageExecutionConfirmationState);

    expect(html).toContain('Prepare image');
    expect(html).not.toContain('Confirm image generation');
    expect(html).not.toContain('Process queue now');
  });

  it('renders the server-resolved candidate before explicit Confirm', () => {
    const html = render({
      phase: 'AWAITING_CONFIRMATION',
      prepared,
      generationId: null,
      error: null,
    });

    expect(html).toContain('mock');
    expect(html).toContain('mock-image-v1');
    expect(html).toContain('Resolved image prompt');
    expect(html).toContain('blur, watermark');
    expect(html).toContain('42');
    expect(html).toContain('asset-ref-1');
    expect(html).toContain('asset-ref-2');
    expect(html).toContain('$0.0123');
    expect(html).toContain('2026-08-13T15:00:00.000Z');
    expect(html).toContain('Continuity warning');
    expect(html).toContain('Confirm image generation');
    expect(html).not.toContain('Process queue now');
  });

  it('disables the active operation while Prepare or Confirm is in flight', () => {
    const preparing = render({
      phase: 'PREPARING',
      prepared: null,
      generationId: null,
      error: null,
    });
    expect(preparing).toContain('Preparing…');
    expect(preparing).toContain('disabled=""');

    const confirming = render({
      phase: 'CONFIRMING',
      prepared,
      generationId: null,
      error: null,
    });
    expect(confirming).toContain('Confirming…');
    expect(confirming).toContain('disabled=""');
  });

  it('moves non-retriable confirmation failures to BLOCKED and clears the reviewed token', () => {
    const failed = imageExecutionConfirmationReducer(
      {
        phase: 'CONFIRMING',
        prepared,
        generationId: null,
        error: null,
      },
      {
        type: 'FAILED',
        code: 'CONFIRMATION_INVALID',
        message: 'Confirmation is invalid.',
      },
    );

    expect(failed).toEqual({
      phase: 'BLOCKED',
      prepared: null,
      generationId: null,
      error: { code: 'CONFIRMATION_INVALID', message: 'Confirmation is invalid.' },
    });
    expect(render(failed)).toContain('Prepare image');
  });

  it('shows whether confirmation queued new work or reused an existing pending generation', () => {
    const enqueued: ImageExecutionConfirmationState = {
      phase: 'ENQUEUED',
      prepared,
      generationId: 'generation-1',
      error: null,
    };

    expect(render(enqueued, false)).toContain('Image queued');
    expect(render(enqueued, true)).toContain('Already queued');
    expect(render(enqueued, true)).toContain('generation-1');
  });
});

describe('Shot Inspector image confirmation wiring', () => {
  it('builds the initial image request from the current shot, latest image prompt and existing provider defaults', () => {
    expect(shotPageSource).toContain('const imageGenerationRequest');
    expect(shotPageSource).toContain("kind: 'image' as const");
    expect(shotPageSource).toContain('projectId: project.id');
    expect(shotPageSource).toContain('shotId: shot.id');
    expect(shotPageSource).toContain('promptId: imagePrompt.prompt.id');
    expect(shotPageSource).toContain('provider: preflightReadiness.image.provider');
    expect(shotPageSource).toContain('model: preflightReadiness.image.model');
    expect(shotPageSource).toContain('imageGenerationRequest,');
  });

  it('wires Prepare and Confirm into Generations without adding worker execution controls', () => {
    expect(generationsSource).toContain('ImageGenerationConfirmation');
    expect(generationsSource).toContain('prepareImageGenerationAction.bind');
    expect(generationsSource).toContain('confirmImageGenerationAction.bind');
    expect(generationsSource).toContain('imageGenerationRequest');
    expect(generationsSource).not.toContain('Process queue now');
    expect(generationsSource).not.toContain('queue/drain');
  });
});
