import { DomainError } from './errors';

const UNSAFE_SEGMENT = /(^|\/)\.\.(\/|$)/;

/** Validates a portable, relative storage key without consulting the filesystem. */
export function normaliseStorageKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  const key = trimmed.replace(/\\/g, '/');
  if (!key) throw new DomainError('VALIDATION_FAILED', 'Storage key must not be empty');
  if (key.startsWith('/')) {
    throw new DomainError('VALIDATION_FAILED', 'Storage key must be relative, not absolute');
  }
  if (/^[a-zA-Z]:/.test(key)) {
    throw new DomainError('VALIDATION_FAILED', 'Storage key must not use a drive-letter path');
  }
  if (UNSAFE_SEGMENT.test(key)) {
    throw new DomainError('VALIDATION_FAILED', 'Storage key must not traverse directories');
  }
  if (key.includes('\0')) {
    throw new DomainError('VALIDATION_FAILED', 'Storage key must not contain a null byte');
  }
  return key;
}
