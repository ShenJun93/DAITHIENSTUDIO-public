import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  VideoGenerationConfirmationView,
  videoExecutionConfirmationReducer,
  initialVideoExecutionConfirmationState,
  type VideoExecutionConfirmationState,
} from '@/components/shot-inspector/VideoGenerationConfirmation';
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
    model: 'mock-video-v1',
    prompt: 'Resolved video prompt',
    negativePrompt: 'blur, watermark',
    estimatedCostUsd: 0.0123,
    reviewedDurationSeconds: 3,
    seed: 42,
    params: { durationSeconds: 3 },
    referenceAssetIds: ['asset-ref-1', 'asset-ref-2'],
    priority: 100,
    warnings: ['Continuity warning'],
  },
};

function render(state: VideoExecutionConfirmationState, reused = false): string {
  return renderToStaticMarkup(
    createElement(VideoGenerationConfirmationView, {
      state,
      reused,
      onPrepare: () => undefined,
      onConfirm: () => undefined,
    }),
  );
}

describe('safe video execution confirmation UI state', () => {
  it('starts IDLE and cannot confirm before Prepare', () => {
    expect(initialVideoExecutionConfirmationState.phase).toBe('IDLE');
    expect(
      videoExecutionConfirmationReducer(initialVideoExecutionConfirmationState, { type: 'CONFIRM_STARTED' }),
    ).toEqual(initialVideoExecutionConfirmationState);
  });

  it('requires Prepare before explicit Confirm', () => {
    const preparing = videoExecutionConfirmationReducer(
      initialVideoExecutionConfirmationState,
      { type: 'PREPARE_STARTED' },
    );
    expect(preparing.phase).toBe('PREPARING');

    const awaiting = videoExecutionConfirmationReducer(preparing, {
      type: 'PREPARE_SUCCEEDED',
      prepared,
    });
    expect(awaiting).toMatchObject({ phase: 'AWAITING_CONFIRMATION', prepared });

    const confirming = videoExecutionConfirmationReducer(awaiting, { type: 'CONFIRM_STARTED' });
    expect(confirming.phase).toBe('CONFIRMING');

    const enqueued = videoExecutionConfirmationReducer(confirming, {
      type: 'CONFIRM_SUCCEEDED',
      generationId: 'generation-1',
    });
    expect(enqueued).toMatchObject({ phase: 'ENQUEUED', generationId: 'generation-1' });
  });

  it.each(['CONFIRMATION_EXPIRED', 'CONFIRMATION_STALE'] as const)(
    '%s clears the review and requires Prepare again',
    (code) => {
      const state = videoExecutionConfirmationReducer(
        { phase: 'AWAITING_CONFIRMATION', prepared, generationId: null, error: null },
        { type: 'CONFIRM_STARTED' },
      );
      const failed = videoExecutionConfirmationReducer(state, {
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

describe('safe video execution confirmation UI view', () => {
  it('offers Prepare first and does not expose Confirm while IDLE', () => {
    const html = render(initialVideoExecutionConfirmationState);

    expect(html).toContain('Prepare video');
    expect(html).not.toContain('Confirm video generation');
    expect(html).not.toContain('Process queue now');
  });

  it('renders the server-resolved candidate before explicit Confirm', () => {
    const html = render({
      phase: 'AWAITING_CONFIRMATION',
      prepared,
      generationId: null,
      error: null,
    });

    expect(html).toContain('Video execution review');
    expect(html).toContain('mock');
    expect(html).toContain('mock-video-v1');
    expect(html).toContain('Resolved video prompt');
    expect(html).toContain('blur, watermark');
    expect(html).toContain('42');
    expect(html).toContain('asset-ref-1');
    expect(html).toContain('asset-ref-2');
    expect(html).toContain('$0.0123');
    expect(html).toContain('2026-08-13T15:00:00.000Z');
    expect(html).toContain('Reviewed duration');
    expect(html).toContain('Continuity warning');
    expect(html).toContain('Confirm video generation');
    expect(html).not.toContain('Process queue now');
  });

  it('explains that reviewed duration drives cost review and Confirm only queues pending work', () => {
    const html = render({
      phase: 'AWAITING_CONFIRMATION',
      prepared,
      generationId: null,
      error: null,
    });

    expect(html).toContain('Reviewed duration is used for this confirmation/cost review.');
    expect(html).toContain('Confirm queues pending work and does not run the video provider.');
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
    const failed = videoExecutionConfirmationReducer(
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
    expect(render(failed)).toContain('Prepare video');
  });

  it('shows whether confirmation queued new work or reused an existing pending generation', () => {
    const enqueued: VideoExecutionConfirmationState = {
      phase: 'ENQUEUED',
      prepared,
      generationId: 'generation-1',
      error: null,
    };

    expect(render(enqueued, false)).toContain('Video queued');
    expect(render(enqueued, true)).toContain('Already queued');
    expect(render(enqueued, true)).toContain('generation-1');
  });
});

describe('Shot Inspector video confirmation wiring', () => {
  it('builds the initial video request from the current shot, latest video prompt and existing provider defaults', () => {
    expect(shotPageSource).toContain('const videoGenerationRequest');
    expect(shotPageSource).toContain("kind: 'video' as const");
    expect(shotPageSource).toContain('projectId: project.id');
    expect(shotPageSource).toContain('shotId: shot.id');
    expect(shotPageSource).toContain('promptId: videoPrompt.prompt.id');
    expect(shotPageSource).toContain('provider: preflightReadiness.video.provider');
    expect(shotPageSource).toContain('model: preflightReadiness.video.model');
    expect(shotPageSource).toContain('videoPrompt && preflightReadiness.video.model');
    expect(shotPageSource).toContain('params: { durationSeconds: shot.durationSeconds }');
    expect(shotPageSource).toContain('referenceAssetIds: []');
    expect(shotPageSource).toContain('videoGenerationRequest,');
  });

  it('wires Prepare and Confirm into Generations without adding worker execution controls', () => {
    expect(generationsSource).toContain('<VideoGenerationConfirmation');
    expect(generationsSource).toContain('prepareVideoGenerationAction.bind');
    expect(generationsSource).toContain('confirmVideoGenerationAction.bind');
    expect(generationsSource).toContain('videoGenerationRequest');
    expect(generationsSource).not.toContain('Process queue now');
    expect(generationsSource).not.toContain('queue/drain');
  });
});