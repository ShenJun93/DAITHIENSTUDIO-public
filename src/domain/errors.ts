/**
 * Stable, client-safe error codes. Raw database or provider errors must never
 * reach an HTTP response — they are wrapped here.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'IMMUTABLE_APPROVED_ASSET',
  'MISSING_REFERENCE',
  'LOCK_REQUIRED',
  'PROMPT_LINT_BLOCKED',
  'COST_LIMIT_EXCEEDED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_REJECTED',
  'PROVIDER_TIMEOUT',
  'MEDIA_TIMEOUT',
  'MEDIA_CANCELLED',
  'MEDIA_FAILED',
  'JOB_NOT_CANCELLABLE',
  'UNSUPPORTED_CAPABILITY',
  'CONFIRMATION_REQUIRED',
  'CONFIRMATION_INVALID',
  'CONFIRMATION_EXPIRED',
  'CONFIRMATION_STALE',
  'UNAUTHORIZED',
  'STORAGE_FAILED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IMMUTABLE_APPROVED_ASSET: 409,
  MISSING_REFERENCE: 422,
  LOCK_REQUIRED: 422,
  PROMPT_LINT_BLOCKED: 422,
  COST_LIMIT_EXCEEDED: 402,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_REJECTED: 422,
  PROVIDER_TIMEOUT: 504,
  MEDIA_TIMEOUT: 504,
  MEDIA_CANCELLED: 409,
  MEDIA_FAILED: 422,
  JOB_NOT_CANCELLABLE: 409,
  UNSUPPORTED_CAPABILITY: 400,
  CONFIRMATION_REQUIRED: 409,
  CONFIRMATION_INVALID: 400,
  CONFIRMATION_EXPIRED: 409,
  CONFIRMATION_STALE: 409,
  UNAUTHORIZED: 401,
  STORAGE_FAILED: 500,
  INTERNAL: 500,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details ?? null;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

export function notFound(what: string, id: string): DomainError {
  return new DomainError('NOT_FOUND', `${what} not found: ${id}`);
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code];
}
