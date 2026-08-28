Feature: Generation jobs, assets and approval

  Scenario: Queue a generation and track it through to completion
    Given a shot with a compiled prompt
    When a generation is queued and the worker drains the queue
    Then the job reaches completed
    And an asset with a non-zero size and a checksum is registered

  Scenario: Retrying an identical generation reuses the job instead of duplicating it
    When the same generation request is submitted again
    Then the existing job is returned instead of spending twice

  Scenario: Manually retry a failed generation without erasing its audit trail
    Given a failed generation in the Shot Inspector
    When the operator retries that failed job
    Then the failed source generation remains failed
    And one new pending generation is created from the exact stored prompt version, provider, model, seed, params and references
    And repeated submission for the same failed source returns the same retry job
    And the existing atomic project cost reservation gate still applies

  Scenario: Cancel only a queued generation from the Shot Inspector
    Given a generation shown in the Shot Inspector
    When the generation is pending
    Then the operator may cancel that queued job
    But processing, completed, failed and already-cancelled jobs expose no cancel control

  Scenario: Approve an asset and refuse to change it afterwards
    When an asset is approved
    Then it cannot be rejected or deleted afterwards

  Scenario: Trace an asset back to its prompt version and bible snapshots
    When the lineage of a generated asset is requested
    Then it names the generation, the prompt version, the shot and the bible snapshots

  Scenario: Record a quality report with automatic and manual checks
    When the quality check runs on an asset
    Then automatic checks are evaluated and human-eye checks are marked manual

  Scenario: Compare two generated candidates with exact provenance and review metadata
    Given a shot with multiple generated asset candidates
    When the operator selects up to two candidates in the Generations workspace
    Then each comparison names its exact generation, provider, model, cost, pinned prompt, QC and approval evidence
    And the comparison selection is not persisted as production truth

  Scenario: Approve an exact asset only after its QC and generation-pinned prompt lint are clean
    Given a generated asset awaiting review
    When the operator approves that exact asset
    Then approval is refused until that asset has an exact quality report
    And the exact prompt version pinned by its generation has no blocking lint findings

  Scenario: Rejecting a losing candidate preserves an approved shot
    Given a shot with one approved asset and another pending candidate
    When the operator rejects the pending candidate
    Then the shot remains approved

  Scenario: Asset decision state and event roll back together when the event cannot be recorded
    Given an asset awaiting review
    When recording its approval event fails
    Then its approval state is unchanged
    And no partial approval event remains
