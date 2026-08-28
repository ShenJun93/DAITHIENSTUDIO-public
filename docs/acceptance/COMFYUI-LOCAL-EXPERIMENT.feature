Feature: ComfyUI local image workflow experiment

  Scenario: submits, completes, downloads and returns one image from a core-node workflow
    Given a configured loopback ComfyUI image provider
    When a core-node 512 by 512 workflow completes successfully
    Then the returned image carries zero cost and bounded provenance

  Scenario: rejects a malformed submit or history response as PROVIDER_BAD_RESPONSE
    Given ComfyUI returns a response outside its local API contract
    When the adapter parses the response
    Then it fails without creating an artifact

  Scenario: rejects image MIME, filename and magic-byte mismatches before returning an artifact
    Given ComfyUI labels arbitrary bytes or a mismatched filename as an image
    When the adapter validates the downloaded output tuple
    Then it refuses the output before storage or smoke success

  Scenario: treats a ComfyUI workflow validation error as terminal
    Given ComfyUI rejects the submitted graph as invalid
    When the adapter maps the provider failure
    Then it does not retry the invalid workflow

  Scenario: returns stable unavailable and timeout failures without prompt leakage
    Given the loopback server is unavailable or exceeds the job deadline
    When the adapter maps the transport failure
    Then the error is stable and omits the private prompt and transport detail

  Scenario: refuses ComfyUI redirects without following a non-loopback target
    Given the configured loopback server responds with a redirect
    When the redirect targets a non-loopback service
    Then the adapter refuses it without issuing another request

  Scenario: rejects invalid sampling parameters before submit
    Given sampling parameters exceed the experimental contract
    When the image request reaches the adapter
    Then it fails validation before contacting ComfyUI

  Scenario: aborts studio-side polling promptly without submitting another request
    Given a ComfyUI job is pending
    When the studio abort signal fires
    Then local polling stops promptly

  Scenario: maps aborts during streamed history and image bodies to terminal cancellation
    Given ComfyUI has started streaming a history or image body
    When the studio abort signal fires before the body completes
    Then the failure is terminal cancellation rather than a retryable timeout

  Scenario: rejects unsupported aspect ratios and reference images before submit
    Given the experimental adapter supports only square text-to-image
    When an unsupported request reaches the adapter
    Then it fails before contacting ComfyUI

  Scenario: registers explicitly at zero cost while mock remains the unconfigured default
    Given ComfyUI configuration is optional
    When the registry is built with and without it
    Then selection is explicit and the mock default remains unchanged

  Scenario: refuses non-loopback ComfyUI endpoints for the local experiment
    Given the experimental task permits loopback endpoints only
    When a LAN or public endpoint is configured
    Then provider construction refuses it

  Scenario: stores a completed ComfyUI image with generation provenance and zero cost
    Given a queued Studio image generation selects the configured ComfyUI provider
    When the worker completes the local workflow
    Then the stored asset points back to the generation and records zero cost
