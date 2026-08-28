import type { DeliveryAdapter } from '@/application/ports';
import { DomainError } from '@/domain/errors';

export interface DeliveryAdapterOptions {
  allowedHosts?: readonly string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createDeliveryAdapter(options: DeliveryAdapterOptions = {}): DeliveryAdapter {
  const allowedHosts = new Set((options.allowedHosts ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean));
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async deliver(endpoint, payload, idempotencyKey) {
      let url: URL;
      try {
        url = new URL(endpoint);
      } catch {
        throw new DomainError('VALIDATION_FAILED', 'Publishing endpoint is invalid.');
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new DomainError('VALIDATION_FAILED', 'Publishing endpoint must be an HTTP(S) URL without credentials.');
      }
      if (allowedHosts.size === 0) {
        throw new DomainError('PROVIDER_UNAVAILABLE', 'Publishing delivery is disabled until an endpoint host is configured.');
      }
      if (!allowedHosts.has(url.hostname.toLowerCase())) {
        throw new DomainError('VALIDATION_FAILED', 'Publishing endpoint host is not allowed.');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(payload),
          signal: controller.signal,
          redirect: 'error',
        });
        if (response.status >= 400 && response.status < 500) {
          throw new DomainError('VALIDATION_FAILED', `Publishing destination rejected the request (HTTP ${response.status}).`);
        }
        if (!response.ok) {
          throw new DomainError('PROVIDER_REJECTED', `Publishing destination is unavailable (HTTP ${response.status}).`);
        }
      } catch (error) {
        if (error instanceof DomainError) throw error;
        if (controller.signal.aborted) throw new DomainError('PROVIDER_TIMEOUT', 'Publishing delivery timed out.');
        throw new DomainError('PROVIDER_REJECTED', 'Publishing delivery failed.');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
