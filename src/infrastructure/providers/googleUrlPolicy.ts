/**
 * Host allowlist and redirect revalidation for every outbound Google request.
 *
 * A Google credential must reach only an explicitly allowlisted HTTPS host —
 * including a media URL a Google response points us at, and every hop of an
 * HTTP redirect. The credential header is attached inside this module, never
 * by the caller, so a URL that fails the policy can never carry it.
 */
import { ProviderError, fetchWithTimeout } from './retry';

export const GOOGLE_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'generativelanguage.googleapis.com',
  'texttospeech.googleapis.com',
]);

const MAX_REDIRECTS = 5;

function untrusted(message: string): never {
  throw new ProviderError({ errorClass: 'fatal', code: 'PROVIDER_UNTRUSTED_URL', message });
}

export function assertAllowedGoogleUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return untrusted('Google returned a URL that could not be parsed.');
  }
  if (url.protocol !== 'https:') return untrusted(`Refusing a non-HTTPS Google URL (${url.protocol}).`);
  if (url.username || url.password) return untrusted('Refusing a Google URL that embeds credentials.');
  if (!GOOGLE_ALLOWED_HOSTS.includes(url.hostname)) {
    return untrusted(`Refusing a Google URL outside the allowlisted hosts (${url.hostname}).`);
  }
  // An allowlisted hostname on an unexpected port is still an unexpected
  // endpoint; only the default HTTPS port may carry the credential.
  if (url.port !== '') return untrusted(`Refusing a Google URL on a non-default port (${url.port}).`);
  return url;
}

export interface GoogleFetchInit {
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Fetches through the host allowlist, revalidating every redirect hop before
 * following it and before the credential header is attached to it.
 */
export async function fetchGoogleWithPolicy(
  initialUrl: string,
  init: GoogleFetchInit,
  apiKey: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  let currentUrl = assertAllowedGoogleUrl(initialUrl).toString();

  // RFC 7231: 301/302/303 are re-issued as GET without a body; only 307/308
  // preserve the original method. Replaying a POST across a redirect would
  // bill a second generation and re-transmit the prompt.
  let method = init.method;
  let body = init.body;
  let headers = { ...init.headers };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchWithTimeout(
      currentUrl,
      {
        method,
        body,
        // Load-bearing: undici strips `Authorization` on a cross-origin
        // redirect but not an arbitrary custom header, so auto-following would
        // hand `x-goog-api-key` to the redirect target before we could check
        // it. Every redirect must come back to us for revalidation.
        redirect: 'manual',
        headers: { ...headers, 'x-goog-api-key': apiKey },
      },
      timeoutMs,
      signal,
    );

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) {
        throw new ProviderError({
          errorClass: 'fatal',
          code: 'PROVIDER_BAD_RESPONSE',
          message: 'Google returned a redirect with no Location header.',
        });
      }

      // Resolving the Location can itself throw on a malformed value. Left
      // unguarded it escapes as a raw TypeError, which `withRetry` treats as
      // retryable — turning one bad response into repeated paid requests.
      let resolved: URL;
      try {
        resolved = new URL(location, currentUrl);
      } catch {
        throw new ProviderError({
          errorClass: 'fatal',
          code: 'PROVIDER_BAD_RESPONSE',
          message: 'Google returned a redirect with an unparseable Location header.',
        });
      }

      currentUrl = assertAllowedGoogleUrl(resolved.toString()).toString();

      if (response.status !== 307 && response.status !== 308) {
        method = 'GET';
        body = undefined;
        headers = Object.fromEntries(
          Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'content-type'),
        );
      }
      continue;
    }

    return response;
  }

  return untrusted(`Refusing to follow more than ${MAX_REDIRECTS} redirects while contacting Google.`);
}
