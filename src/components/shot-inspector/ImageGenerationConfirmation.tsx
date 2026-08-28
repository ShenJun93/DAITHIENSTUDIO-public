'use client';

import React, { useReducer, useState } from 'react';
import type { PrepareImageGenerationInput } from '@/domain/schemas';

export type ImageExecutionConfirmationPhase =
  | 'IDLE'
  | 'PREPARING'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMING'
  | 'ENQUEUED'
  | 'BLOCKED';

export interface PreparedImageExecutionConfirmation {
  confirmationToken: string;
  expiresAt: string;
  preview: {
    projectId?: string;
    productionType?: string | null;
    shotId?: string | null;
    promptId?: string | null;
    promptVersion?: number | null;
    provider: string;
    model: string;
    prompt?: string;
    negativePrompt?: string;
    estimatedCostUsd: number;
    seed?: number | null;
    params?: Record<string, unknown>;
    referenceAssetIds?: string[];
    priority?: number;
    warnings?: string[];
  };
}

export interface ImageExecutionConfirmationState {
  phase: ImageExecutionConfirmationPhase;
  prepared: PreparedImageExecutionConfirmation | null;
  generationId: string | null;
  error: { code: string; message: string } | null;
}

export type ImageExecutionConfirmationAction =
  | { type: 'PREPARE_STARTED' }
  | { type: 'PREPARE_SUCCEEDED'; prepared: PreparedImageExecutionConfirmation }
  | { type: 'CONFIRM_STARTED' }
  | { type: 'CONFIRM_SUCCEEDED'; generationId: string }
  | { type: 'FAILED'; code: string; message: string };

export const initialImageExecutionConfirmationState: ImageExecutionConfirmationState = {
  phase: 'IDLE',
  prepared: null,
  generationId: null,
  error: null,
};

export function imageExecutionConfirmationReducer(
  state: ImageExecutionConfirmationState,
  action: ImageExecutionConfirmationAction,
): ImageExecutionConfirmationState {
  switch (action.type) {
    case 'PREPARE_STARTED':
      return {
        phase: 'PREPARING',
        prepared: null,
        generationId: null,
        error: null,
      };

    case 'PREPARE_SUCCEEDED':
      if (state.phase !== 'PREPARING') return state;
      return {
        phase: 'AWAITING_CONFIRMATION',
        prepared: action.prepared,
        generationId: null,
        error: null,
      };

    case 'CONFIRM_STARTED':
      if (state.phase !== 'AWAITING_CONFIRMATION' || !state.prepared) return state;
      return {
        ...state,
        phase: 'CONFIRMING',
        error: null,
      };

    case 'CONFIRM_SUCCEEDED':
      if (state.phase !== 'CONFIRMING') return state;
      return {
        ...state,
        phase: 'ENQUEUED',
        generationId: action.generationId,
        error: null,
      };

    case 'FAILED':
      if (action.code === 'CONFIRMATION_EXPIRED' || action.code === 'CONFIRMATION_STALE') {
        return {
          phase: 'IDLE',
          prepared: null,
          generationId: null,
          error: { code: action.code, message: action.message },
        };
      }
      return {
        phase: 'BLOCKED',
        prepared: null,
        generationId: null,
        error: { code: action.code, message: action.message },
      };
  }
}


interface PrepareActionResult {
  ok: boolean;
  message: string;
  code?: string;
  data?: PreparedImageExecutionConfirmation;
}

interface ConfirmActionResult {
  ok: boolean;
  message: string;
  code?: string;
  data?: {
    generation: { id: string };
    reused: boolean;
  };
}

export function ImageGenerationConfirmation({
  request,
  prepareAction,
  confirmAction,
}: {
  request: PrepareImageGenerationInput;
  prepareAction: (request: PrepareImageGenerationInput) => Promise<PrepareActionResult>;
  confirmAction: (confirmation: {
    request: PrepareImageGenerationInput;
    confirmationToken: string;
  }) => Promise<ConfirmActionResult>;
}) {
  const [state, dispatch] = useReducer(
    imageExecutionConfirmationReducer,
    initialImageExecutionConfirmationState,
  );
  const [reused, setReused] = useState(false);

  const fail = (code: string | undefined, message: string): void => {
    dispatch({ type: 'FAILED', code: code ?? 'INTERNAL', message });
  };

  const onPrepare = async (): Promise<void> => {
    dispatch({ type: 'PREPARE_STARTED' });
    setReused(false);
    try {
      const result = await prepareAction(request);
      if (!result.ok || !result.data) {
        fail(result.code, result.message);
        return;
      }
      dispatch({ type: 'PREPARE_SUCCEEDED', prepared: result.data });
    } catch {
      fail('INTERNAL', 'Unable to prepare image generation.');
    }
  };

  const onConfirm = async (): Promise<void> => {
    if (state.phase !== 'AWAITING_CONFIRMATION' || !state.prepared) return;

    const confirmationToken = state.prepared.confirmationToken;
    dispatch({ type: 'CONFIRM_STARTED' });

    try {
      const result = await confirmAction({ request, confirmationToken });
      if (!result.ok || !result.data) {
        fail(result.code, result.message);
        return;
      }

      setReused(result.data.reused);
      dispatch({
        type: 'CONFIRM_SUCCEEDED',
        generationId: result.data.generation.id,
      });
    } catch {
      fail('INTERNAL', 'Unable to confirm image generation.');
    }
  };

  return (
    <ImageGenerationConfirmationView
      state={state}
      reused={reused}
      onPrepare={() => void onPrepare()}
      onConfirm={() => void onConfirm()}
    />
  );
}

export function ImageGenerationConfirmationView({
  state,
  reused = false,
  onPrepare,
  onConfirm,
}: {
  state: ImageExecutionConfirmationState;
  reused?: boolean;
  onPrepare: () => void;
  onConfirm: () => void;
}) {
  const prepared = state.prepared;
  const preview = prepared?.preview;

  if (state.phase === 'ENQUEUED') {
    return (
      <section aria-label="Image generation confirmation" className="space-y-3 rounded-lg border border-line p-4">
        <p className="text-sm font-semibold text-ink-hi">
          {reused ? 'Already queued' : 'Image queued'}
        </p>
        {state.generationId && (
          <p className="font-mono text-xs text-ink-mid">{state.generationId}</p>
        )}
      </section>
    );
  }

  const showReview =
    (state.phase === 'AWAITING_CONFIRMATION' || state.phase === 'CONFIRMING') &&
    prepared &&
    preview;

  return (
    <section aria-label="Image generation confirmation" className="space-y-4 rounded-lg border border-line p-4">
      <div>
        <p className="text-sm font-semibold text-ink-hi">Image execution review</p>
        <p className="mt-1 text-xs text-ink-mid">
          Prepare resolves the exact candidate without queueing work. Confirm explicitly queues that reviewed candidate.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {state.error.message} ({state.error.code})
        </p>
      )}

      {showReview && (
        <div className="space-y-3 rounded-md border border-line bg-surface-2 p-3 text-xs">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-ink-lo">Provider</dt><dd className="text-ink-hi">{preview.provider}</dd></div>
            <div><dt className="text-ink-lo">Model</dt><dd className="text-ink-hi">{preview.model}</dd></div>
            <div><dt className="text-ink-lo">Estimated cost</dt><dd className="text-ink-hi">${preview.estimatedCostUsd.toFixed(4)}</dd></div>
            <div><dt className="text-ink-lo">Expires</dt><dd className="text-ink-hi">{prepared.expiresAt}</dd></div>
            <div><dt className="text-ink-lo">Seed</dt><dd className="text-ink-hi">{preview.seed ?? '—'}</dd></div>
            <div><dt className="text-ink-lo">Prompt version</dt><dd className="text-ink-hi">{preview.promptVersion ?? '—'}</dd></div>
          </dl>

          <div>
            <p className="text-ink-lo">Prompt</p>
            <p className="mt-1 whitespace-pre-wrap text-ink-hi">{preview.prompt ?? ''}</p>
          </div>

          <div>
            <p className="text-ink-lo">Negative prompt</p>
            <p className="mt-1 whitespace-pre-wrap text-ink-hi">{preview.negativePrompt ?? ''}</p>
          </div>

          <div>
            <p className="text-ink-lo">References</p>
            {preview.referenceAssetIds && preview.referenceAssetIds.length > 0 ? (
              <ul className="mt-1 space-y-1 font-mono text-ink-hi">
                {preview.referenceAssetIds.map((assetId) => <li key={assetId}>{assetId}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-ink-mid">None</p>
            )}
          </div>

          {preview.warnings && preview.warnings.length > 0 && (
            <div>
              <p className="text-ink-lo">Warnings</p>
              <ul className="mt-1 space-y-1 text-ink-hi">
                {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {showReview ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={state.phase === 'CONFIRMING'}
          aria-busy={state.phase === 'CONFIRMING'}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface-0 disabled:opacity-60"
        >
          {state.phase === 'CONFIRMING' ? 'Confirming…' : 'Confirm image generation'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onPrepare}
          disabled={state.phase === 'PREPARING'}
          aria-busy={state.phase === 'PREPARING'}
          className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink-hi disabled:opacity-60"
        >
          {state.phase === 'PREPARING' ? 'Preparing…' : 'Prepare image'}
        </button>
      )}
    </section>
  );
}
