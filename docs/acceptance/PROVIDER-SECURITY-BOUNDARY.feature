# Behaviour specification for the Google credential and response boundary
# (TASK-010, Phase 1).
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link, so a scenario cannot quietly
# become aspirational.
#
# Every scenario runs offline against synthetic fixtures. No scenario here
# makes a live Google call or requires GOOGLE_API_KEY.

Feature: A Google credential reaches only an allowlisted host

  Scenario: accepts an allowlisted HTTPS host
    Given the Gemini API host is on the allowlist
    When a request URL for that host is checked against the policy
    Then the policy accepts it

  Scenario: refuses a non-HTTPS URL
    Given a Google API host reached over plain HTTP
    When the URL is checked against the policy
    Then the policy refuses it before any credentialed request is sent

  Scenario: refuses a host outside the allowlist
    Given a URL pointing at a host that is not an allowlisted Google host
    When the URL is checked against the policy
    Then the policy refuses it before any credentialed request is sent

  Scenario: refuses a URL that embeds a userinfo component
    Given a URL that carries a userinfo component before the host
    When the URL is checked against the policy
    Then the policy refuses it before any credentialed request is sent

  Scenario: refuses an allowlisted host on a non-default port
    Given an allowlisted Google hostname reached on port 8443
    When the URL is checked against the policy
    Then the policy refuses it before any credentialed request is sent

  Scenario: requests every hop with redirect manual so the credential is never auto-forwarded
    Given a Google endpoint that redirects twice within the allowlist
    When the adapter follows the chain
    Then every hop is requested with manual redirect handling

  Scenario: refuses an unparseable Location instead of throwing a retryable TypeError
    Given a Google endpoint that redirects to a Location that cannot be parsed
    When the adapter resolves the redirect target
    Then it fails with PROVIDER_BAD_RESPONSE rather than a retryable error

  Scenario: refuses a protocol-relative Location pointing off the allowlist
    Given a Google endpoint that redirects to a protocol-relative attacker host
    When the adapter resolves the redirect target
    Then the redirect is refused and no credentialed request is sent to that host

  Scenario: follows a relative Location that stays on the allowlisted host
    Given a Google endpoint that redirects to a relative path on the same host
    When the adapter resolves the redirect target
    Then it follows the redirect to the allowlisted host

Feature: A redirect cannot bill a second generation

  Scenario: re-issues a 302 as GET without a body so a redirect cannot bill a second generation
    Given a POST to a Google endpoint that answers with a 302
    When the adapter follows the redirect
    Then the next hop is a GET with no body and no content type

  Scenario: preserves the method and body across a 308 redirect
    Given a POST to a Google endpoint that answers with a 308
    When the adapter follows the redirect
    Then the next hop keeps the original method and body

  Scenario: follows a redirect to another allowlisted host and attaches the credential to both hops
    Given a Google endpoint that redirects to a second allowlisted Google host
    When the adapter follows the redirect
    Then both hops carry the credential and the final body is returned

  Scenario: refuses a redirect to a host outside the allowlist and never attaches the credential to it
    Given a Google endpoint that redirects to an attacker-controlled host
    When the adapter revalidates the redirect target
    Then the redirect is refused and only the original allowlisted request was ever sent

  Scenario: refuses more than the configured number of redirect hops
    Given a Google endpoint that redirects indefinitely within the allowlist
    When the adapter follows the redirect chain
    Then the chain is refused once the hop limit is exceeded

  Scenario: refuses to download a video URI outside the allowlist and never attaches the credential to it
    Given a completed Veo operation whose sample URI points outside the allowlist
    When the adapter tries to download the sample
    Then the download is refused and no credentialed request is sent to that host

  Scenario: downloads a returned URI through the allowlist policy
    Given a completed Veo operation whose sample URI is an allowlisted Google media host
    When the adapter downloads the sample
    Then the video bytes become an artifact

  Scenario: never includes the configured API key in a thrown error message
    Given a Google response that fails its contract
    When the adapter raises the resulting provider error
    Then the error message does not contain the configured API key

Feature: A malformed Google response never produces a partial asset

  Scenario: returns image artifacts from a valid predict response
    Given a well-formed Imagen predict response
    When the adapter parses it
    Then the image bytes become an artifact

  Scenario: rejects a response whose predictions are the wrong shape as PROVIDER_BAD_RESPONSE
    Given an Imagen response whose prediction bytes are not a string
    When the adapter parses it against the response contract
    Then it fails with PROVIDER_BAD_RESPONSE and creates no asset

  Scenario: rejects a prediction whose base64 payload is malformed instead of storing garbage bytes
    Given an Imagen response whose base64 payload is not valid base64
    When the adapter parses it against the response contract
    Then it fails with PROVIDER_BAD_RESPONSE and creates no asset

  Scenario: rejects base64 payloads that decode to zero bytes instead of creating an empty artifact
    Given an Imagen response carrying whitespace-only or incomplete base64
    When the adapter validates and decodes the response
    Then it fails with PROVIDER_BAD_RESPONSE and creates no empty artifact

  Scenario: accepts a valid padded base64 payload containing line breaks
    Given an Imagen response carrying valid line-wrapped padded base64
    When the adapter validates and decodes the response
    Then the original bytes are returned unchanged

  Scenario: rejects an unsupported provider-declared image MIME type as PROVIDER_BAD_RESPONSE
    Given Imagen declares a format outside the supported image matrix
    When the adapter validates the response
    Then it fails with PROVIDER_BAD_RESPONSE before returning an artifact

  Scenario: treats an empty prediction list as a safety rejection, not a crash
    Given an Imagen response with no predictions
    When the adapter parses it
    Then it fails with PROVIDER_SAFETY so the operator can rewrite the prompt

  Scenario: turns a non-JSON body into PROVIDER_BAD_RESPONSE
    Given a Google response body that is not JSON
    When the adapter parses it
    Then it fails with PROVIDER_BAD_RESPONSE and creates no asset

  Scenario: returns a video artifact when the operation completes with inline bytes
    Given a completed Veo operation carrying inline video bytes
    When the adapter parses it
    Then the video bytes become an artifact

  Scenario: polls until done and rejects malformed operation polls as PROVIDER_BAD_RESPONSE
    Given a Veo operation that completes with a malformed response payload
    When the adapter polls until the operation is done
    Then it fails with PROVIDER_BAD_RESPONSE and creates no asset

  Scenario: rejects a malformed nested Veo response as PROVIDER_BAD_RESPONSE
    Given a completed Veo operation with a malformed generateVideoResponse container
    When the adapter validates the nested response
    Then it fails with PROVIDER_BAD_RESPONSE rather than a safety rejection

  Scenario: refuses an oversized Veo media response before creating an artifact
    Given an allowlisted Veo media response larger than the configured artifact limit
    When the adapter begins downloading it
    Then it fails before creating or returning an artifact

  Scenario: bounds a non-success Veo media response before reading provider error text
    Given an allowlisted Veo media error declares a body larger than the limit
    When the adapter receives the non-success response
    Then it refuses the body before reading provider error text

  Scenario: does not retain raw provider response text in a classified failure
    Given a provider error body contains private prompt or diagnostic text
    When the HTTP status is classified for persistence and logging
    Then the stable failure message omits the raw provider text

  Scenario: keeps the provider timeout active until the response body is consumed
    Given a provider returns headers and then never completes its body
    When the provider deadline expires during body consumption
    Then the body read fails with PROVIDER_TIMEOUT

  Scenario: rejects an unsupported Veo download MIME type as PROVIDER_BAD_RESPONSE
    Given an allowlisted Veo download returns a non-video Content-Type
    When the adapter validates the media response
    Then it fails with PROVIDER_BAD_RESPONSE before returning an artifact

  Scenario: surfaces a completed operation with no samples as a safety rejection
    Given a Veo operation that completes without returning any sample
    When the adapter parses it
    Then it fails with PROVIDER_SAFETY so the operator can rewrite the prompt

  Scenario: rejects a request over the model duration cap without calling the network
    Given a shot longer than the Veo per-clip maximum
    When the adapter is asked to generate it
    Then it fails with UNSUPPORTED_CAPABILITY before any request is sent

  Scenario: returns an audio artifact from a valid synthesize response
    Given a well-formed Cloud TTS synthesize response
    When the adapter parses it
    Then the audio bytes become an artifact

  Scenario: rejects a response with no audio content as PROVIDER_BAD_RESPONSE
    Given a Cloud TTS response with no audio content
    When the adapter parses it
    Then it fails with PROVIDER_BAD_RESPONSE and creates no asset

  Scenario: rejects a response whose audioContent is the wrong type as PROVIDER_BAD_RESPONSE
    Given a Cloud TTS response whose audio content is not a string
    When the adapter parses it against the response contract
    Then it fails with PROVIDER_BAD_RESPONSE and creates no asset

  Scenario: parses a valid structured JSON response
    Given a well-formed Gemini generateContent response carrying JSON
    When the adapter parses it
    Then the structured value and token count are returned

  Scenario: rejects prose instead of JSON as PROVIDER_BAD_RESPONSE
    Given a Gemini response whose text is prose rather than JSON
    When the adapter parses it
    Then it fails with PROVIDER_BAD_RESPONSE and creates no asset

  Scenario: treats no candidates as a safety rejection
    Given a Gemini response with no candidates
    When the adapter parses it
    Then it fails with PROVIDER_SAFETY so the operator can rewrite the prompt

  Scenario: rejects a response whose candidates are the wrong shape as PROVIDER_BAD_RESPONSE
    Given a Gemini response whose candidates field is not an array
    When the adapter parses it against the response contract
    Then it fails with PROVIDER_BAD_RESPONSE and creates no asset
