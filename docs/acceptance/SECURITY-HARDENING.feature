# Behaviour specification for upload and storage confinement
# (TASK-010, Phase 2 and 3).
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link.

Feature: File upload and provider artifact format validation

  Scenario: parses multipart metadata safely and returns 400 for malformed JSON
    Given a manual upload request with malformed JSON metadata
    When the upload route processes the request
    Then it returns HTTP 400 VALIDATION_FAILED instead of throwing a raw SyntaxError

  Scenario: applies a 50 MB size limit to manual uploads
    Given a manual upload request containing a 51 MB file
    When the upload route processes the request
    Then it is rejected before storage

  Scenario: rejects an oversized multipart request before parsing its body
    Given a multipart request whose declared body exceeds the HTTP boundary limit
    When the upload route receives it
    Then it is rejected before multipart materialization

  Scenario: applies a 50 MB size limit to provider-returned artifacts
    Given a provider returns a payload larger than 50 MB
    When the asset service attempts to store the artifact
    Then it is rejected before storage to prevent unbounded buffering

  Scenario: validates PNG magic bytes
    Given a file declaring itself as PNG but lacking the PNG magic bytes
    When the asset service validates it
    Then it is rejected as a format mismatch

  Scenario: validates JPEG magic bytes
    Given a file declaring itself as JPEG but lacking the JPEG magic bytes
    When the asset service validates it
    Then it is rejected as a format mismatch

  Scenario: validates WEBP magic bytes
    Given a file declaring itself as WEBP but lacking the WEBP magic bytes
    When the asset service validates it
    Then it is rejected as a format mismatch

  Scenario: validates WAV magic bytes
    Given a file declaring itself as WAV but lacking the RIFF/WAVE header
    When the asset service validates it
    Then it is rejected as a format mismatch

  Scenario: validates MP4 ftyp box signature
    Given a file declaring itself as MP4 but lacking a valid ftyp box at offset 4
    When the asset service validates it
    Then it is rejected as a format mismatch

  Scenario: validates WEBM EBML header signature
    Given a file declaring itself as WEBM but lacking the EBML header
    When the asset service validates it
    Then it is rejected as a format mismatch

  Scenario: validates MP3 ID3v2 or ADTS frame signature
    Given a file declaring itself as MP3 but lacking an ID3v2 header or ADTS frame sync
    When the asset service validates it
    Then it is rejected as a format mismatch

  Scenario: validates SVG as XML text and blocks obvious script tags
    Given an SVG file containing a malicious <script> tag
    When the asset service validates it
    Then it is rejected before storage as a defense-in-depth measure

  Scenario: rejects a filename extension that disagrees with the declared MIME and signature
    Given valid PNG bytes declared as image/png but named with an MP4 extension
    When the upload boundary validates the format tuple
    Then it is rejected before storage

  Scenario: rejects a provider artifact whose extension disagrees with its MIME and signature
    Given a provider artifact whose bytes and MIME agree but whose filename extension differs
    When the asset service validates the artifact
    Then it is rejected before storage

Feature: Storage path confinement

  Scenario: refuses a storage key containing a null byte
    Given a storage key containing a null byte
    When the storage provider resolves it
    Then it throws a validation error

  Scenario: refuses a storage key containing a directory traversal
    Given a storage key containing ../ or similar traversal sequences
    When the storage provider resolves it
    Then it throws a validation error

  Scenario: refuses a storage key containing a drive letter
    Given a storage key formatted as an absolute Windows drive path
    When the storage provider resolves it
    Then it throws a validation error

  Scenario: refuses absolute POSIX and UNC storage keys instead of sanitising them
    Given a storage key beginning with a POSIX root or UNC share
    When the storage policy validates it
    Then it throws a validation error instead of converting it to a relative key

  Scenario: resolves symlinks in the target path and ensures they do not escape the storage root
    Given a storage key that passes regex validation but points into a symlink escaping the root
    When the storage provider resolves the absolute path
    Then it throws a storage error before reading or writing

  Scenario: returns a client-safe storage error without exposing the absolute root path
    Given a missing storage object under a machine-specific absolute root
    When the storage provider reports the failure
    Then the serialized error omits the absolute root path

Feature: Safe serving policy for active formats

  Scenario: serves SVG files with restrictive Content-Security-Policy headers
    Given an SVG asset stored successfully
    When a client requests the file via the files route
    Then the response includes a Content-Security-Policy header blocking script execution

Feature: API Boundary Security

  Scenario: returns HTTP 400 for a malformed JSON request body
    Given a mutating JSON request whose body cannot be parsed
    When the API route processes it
    Then it returns HTTP 400 VALIDATION_FAILED

  Scenario: rejects an oversized JSON request before buffering the body
    Given a JSON mutation declares a body larger than the boundary limit
    When the API route begins processing it
    Then it returns HTTP 400 before buffering the body

  Scenario: allows an open mutation when every configured provider is offline
    Given the studio has only offline providers and no Studio API key
    When a mutating request reaches the API boundary
    Then authentication does not block the offline request

  Scenario: refuses a paid-provider mutation when STUDIO_API_KEY is not configured
    Given a paid provider is configured without a Studio API key
    When a mutating request reaches the API boundary
    Then it returns HTTP 401 UNAUTHORIZED before paid work can be requested

  Scenario: refuses an incorrect X-Studio-Key when a paid provider is configured
    Given a paid provider and Studio API key are configured
    When a mutation presents the wrong key
    Then it returns HTTP 401 UNAUTHORIZED

  Scenario: allows a correct X-Studio-Key when a paid provider is configured
    Given a paid provider and Studio API key are configured
    When a mutation presents the correct key
    Then authentication allows the request to continue

  Scenario: masks internal stack traces from API responses
    Given a route handler that throws an internal driver error
    When the API boundary catches it
    Then the response contains a generic INTERNAL error code and no stack trace
