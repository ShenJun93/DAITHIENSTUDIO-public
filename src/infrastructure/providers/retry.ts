/**
 * Retry policy shared by remote providers.
 *
 * Validation errors and safety rejections are never retried — retrying them
 * only spends money to receive the same refusal (rule 05).
 */
export type ErrorClass = 'retryable' | 'validation' | 'safety' | 'auth' | 'timeout' | 'fatal';

export interface ProviderFailure {
  errorClass: ErrorClass;
  code: string;
  message: string;
  status?: number;
}

export class ProviderError extends Error {
  readonly failure: ProviderFailure;

  constructor(failure: ProviderFailure) {
    super(failure.message);
    this.name = 'ProviderError';
    this.failure = failure;
  }
}

export function classifyHttpStatus(status: number, body: string): ProviderFailure {
  const lowered = body.toLowerCase();
  if (status === 401 || status === 403) {
    return { errorClass: 'auth', code: 'PROVIDER_AUTH', message: `Provider rejected credentials (${status})`, status };
  }
  if (status === 400 && (lowered.includes('safety') || lowered.includes('blocked') || lowered.includes('policy'))) {
    return { errorClass: 'safety', code: 'PROVIDER_SAFETY', message: 'Provider blocked the prompt on safety grounds', status };
  }
  if (status === 400 || status === 422) {
    return { errorClass: 'validation', code: 'PROVIDER_VALIDATION', message: `Provider rejected the request (${status})`, status };
  }
  if (status === 408 || status === 504) {
    return { errorClass: 'timeout', code: 'PROVIDER_TIMEOUT', message: `Provider timed out (${status})`, status };
  }
  if (status === 429 || status >= 500) {
    return { errorClass: 'retryable', code: 'PROVIDER_UNAVAILABLE', message: `Provider temporarily unavailable (${status})`, status };
  }
  return { errorClass: 'fatal', code: 'PROVIDER_ERROR', message: `Provider returned an unexpected error (${status})`, status };
}

export function isRetryable(failure: ProviderFailure): boolean {
  return failure.errorClass === 'retryable' || failure.errorClass === 'timeout';
}

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  signal?: AbortSignal;
  onRetry?: (attempt: number, failure: ProviderFailure) => void;
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new ProviderError({ errorClass: 'fatal', code: 'CANCELLED', message: 'Cancelled before request' });
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const failure =
        error instanceof ProviderError
          ? error.failure
          : { errorClass: 'retryable' as ErrorClass, code: 'PROVIDER_UNAVAILABLE', message: 'Provider request failed unexpectedly' };
      if (!isRetryable(failure) || attempt === options.attempts) {
        throw error instanceof ProviderError ? error : new ProviderError(failure);
      }
      options.onRetry?.(attempt, failure);
      const delay = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = (): void => controller.abort();
  const timeoutFailure = (): ProviderError => new ProviderError({
    errorClass: 'timeout',
    code: 'PROVIDER_TIMEOUT',
    message: `Request to provider exceeded ${timeoutMs}ms`,
  });
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  };
  signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.body) {
      cleanup();
      return response;
    }

    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        if (controller.signal.aborted) {
          cleanup();
          streamController.error(timeoutFailure());
          return;
        }
        let abortRead: (() => void) | undefined;
        const aborted = new Promise<never>((_, reject) => {
          abortRead = (): void => reject(timeoutFailure());
          controller.signal.addEventListener('abort', abortRead, { once: true });
        });
        try {
          const chunk = await Promise.race([reader.read(), aborted]);
          if (chunk.done) {
            cleanup();
            streamController.close();
          } else {
            streamController.enqueue(chunk.value);
          }
        } catch (error) {
          cleanup();
          void reader.cancel().catch(() => undefined);
          streamController.error(controller.signal.aborted ? timeoutFailure() : error);
        } finally {
          if (abortRead) controller.signal.removeEventListener('abort', abortRead);
        }
      },
      async cancel(reason) {
        cleanup();
        await reader.cancel(reason);
      },
    });

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    cleanup();
    if (controller.signal.aborted) {
      throw timeoutFailure();
    }
    throw new ProviderError({
      errorClass: 'retryable',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Network error contacting provider',
    });
  }
}
