Feature: Continuity, timeline and export

  Scenario: Report continuity findings that name a field a human can fix
    When the continuity report is generated
    Then every finding carries a classification and a readable message

  Scenario: Assemble a timeline that shows which shots are missing media
    When the timeline is built
    Then every shot appears in order and missing media is listed rather than dropped

  Scenario: Export a project package that freezes the versions it used
    When a project package is exported
    Then it contains the shots, the frozen bible versions, the lineage and the cost summary

  Scenario: Export a shot list as CSV
    When a shot list is exported
    Then it is CSV with a header row and one row per shot

  Scenario: Compose a playable final video from approved shot media
    Given every timeline shot has an approved video asset
    When the operator composes the final video
    Then the MP4 bytes, export record and asset lineage are preserved

  Scenario: Compose the persisted episode audio mix
    Given an episode has approved video and a persisted approved audio track
    When the operator composes that episode
    Then Composer maps timing, duration and gain into the final video and preserves audio lineage

  Scenario: Deliver one export idempotently through the publishing handoff
    Given a completed export, an operator approval and an explicitly enabled delivery destination
    When the operator publishes or retries the same export
    Then delivery status and attempts persist without duplicate delivery

  Scenario: Refuse to publish an export without operator approval
    Given a completed export that has not been approved by an operator
    When the operator attempts to publish it
    Then the delivery is refused and nothing is sent

  Scenario: Persist the selected Hybrid or Auto production strategy
    Given a project uses the Hybrid production strategy
    When the operator reloads the production screen
    Then the persisted project still uses Hybrid

  Scenario: Compose Hybrid video from approved imported images
    Given Hybrid mode has an approved raster image for every shot
    When the operator composes the final video
    Then local motion clips produce an MP4 whose lineage names those images

  Scenario: Auto mode never falls back to manually imported images
    Given Auto mode has approved imported images but no approved provider video
    When the operator attempts to compose the final video
    Then composition stops before FFmpeg and requests approved provider video

  Scenario: Reject unsafe Composer media without leaving partial output
    Given a timeline references unsafe or invalid media
    When the operator attempts to compose the final video
    Then composition fails safely without an export or temporary output
