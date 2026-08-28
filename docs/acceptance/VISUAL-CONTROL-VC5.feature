Feature: Visual Control VC5 exact prompt-version approval
  Prompt review decisions are append-only audit evidence for one immutable prompt version.
  They never authorize generation, provider execution, export, or budget reservation.

  Scenario: Approve the exact current prompt version
    Given an authorized operator is viewing a shot with a persisted image or video prompt version
    When the operator approves that exact version
    Then an approval row is appended with targetType "prompt"
    And targetId is constructed server-side as "<promptId>@<version>"
    And the latest decision for that exact version is displayed

  Scenario: Reject or request changes
    Given an authorized operator is viewing an exact persisted prompt version
    When the operator rejects it or requests changes
    Then the decision is appended without deleting or overwriting prior decisions

  Scenario: New prompt version makes prior evidence stale by derivation
    Given prompt version N has a persisted decision
    When prompt version N+1 becomes current
    Then version N's decision remains historical evidence
    And the current version is shown as unreviewed
    And the prior decision is labelled stale without persisting a stale state

  Scenario: Ownership and identifiers remain server authoritative
    Given a browser submits malformed or cross-project shot/version intent
    When the authenticated prompt approval boundary resolves the request
    Then no approval mutation occurs outside the resolved project and shot
    And the browser cannot supply targetType, targetId, projectId, promptId, or decidedBy

  Scenario: Viewing and deciding have no generation side effects
    Given the operator opens the prompt approval surface or records a review decision
    Then no provider adapter is executed
    And no generation job is enqueued
    And no project budget is reserved
    And no asset or visual-package approval authority is changed
