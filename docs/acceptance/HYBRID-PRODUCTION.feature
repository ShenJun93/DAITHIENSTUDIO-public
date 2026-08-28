# TASK-014D — consistency-first manual/provider acquisition over one pipeline.
# Every Scenario name is matched exactly by a test title.

Feature: Hybrid production references share the canonical studio pipeline

  Scenario: Bind an imported reference to an immutable Bible snapshot
    Given an uploaded image and a concrete Character Bible version
    When the operator binds the image as an identity anchor
    Then the binding persists with the exact snapshot id and approved asset id

  Scenario: Report missing Hybrid anchors before storyboard production
    Given a shot pins character and location snapshots
    When Hybrid readiness is calculated
    Then every missing approved anchor is reported by canonical snapshot id

  Scenario: Keep Auto acquisition provider-only
    Given a project selects Auto and has only manually imported storyboard media
    When production readiness is calculated
    Then manual media is not counted as Auto provider coverage
