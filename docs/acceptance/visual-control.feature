Feature: Visual Control — shot evidence, controlled reference changes, and exact-package approval
  VC2 renders the accepted VC1 read model (`VisualControlState`) inside the
  Shot Inspector. VC3 adds bounded reference repinning; VC4 adds read-only
  continuity evidence; VC5 adds exact prompt-version approval; VC7 exposes
  existing asset-role evidence. VC8 adds operator decisions over the exact
  current visual-package fingerprint, preserving an immutable approved package
  in append-only approval history and deriving invalidation whenever the current
  package fingerprint no longer matches the approved fingerprint. Package
  approval does not authorize provider execution. VC9 closes the acceptance
  chain by proving the integrated exact-package approval inside the existing
  real-SQLite / offline mock-provider vertical slice through export at zero
  actual provider cost. Scenarios are promoted per
  docs/product/VISUAL-CONTROL-ACCEPTANCE-PLAN.md's incremental promotion rule.

  Scenario: operator can see shot visual readiness
    Given a shot whose pinned references resolve, with a compiled prompt and an approved required reference asset
    When the operator opens the Visual Control section on the Shot Inspector
    Then the Readiness strip shows the package evidence is complete with all references approved, and states that provider execution is not yet authorized

  Scenario: operator can see the prompt for the exact shot, with exact versions
    Given a shot with a compiled image prompt
    When the operator opens the Visual Control section on the Shot Inspector
    Then the prompt review card shows the exact compiled prompt, its prompt id, its version number and its lint state

  Scenario: operator can see the reason each shot is not ready
    Given a shot with an unresolved pinned bible snapshot
    When the operator opens the Visual Control section on the Shot Inspector
    Then the Readiness strip shows the first NOT_READY reason, named by blocker code and message, with every other blocker listed

  Scenario: operator can see pinned references per shot
    Given a shot with character, location and prop version pins and a project-level style
    When the operator opens the Visual Control section on the Shot Inspector
    Then the pinned references card shows every pin's kind, code and exact snapshot version, with an explicit repin control for each shot-level Character/Location/Prop pin and the project style shown read-only at project level

  Scenario: operator can check the approved snapshot for each reference
    Given a reference with an approved snapshot and approved assets
    When the operator opens the Visual Control section on the Shot Inspector
    Then the pinned references card shows the approved snapshot id, approved asset count and existing asset-role evidence next to the reference

  Scenario: operator can see continuity info (state vs finding)
    Given a shot with recorded character boundary state and continuity findings
    When the operator opens the Visual Control section on the Shot Inspector
    Then the continuity panel shows the previous/current/next cut context, the character costume/look state at the entering and leaving boundaries, the accepted continuity fingerprint, and continuity findings as a separate group counted and ordered by severity

  Scenario: operator can approve the exact shot visual package
    Given a shot whose current visual package is eligible for approval
    When the operator approves the package fingerprint currently displayed in Visual Control
    Then the server re-reads the authoritative package and records the decision only when the expected fingerprint still matches the current fingerprint

  Scenario: a shot with a blocked/violating continuity finding cannot be approved
    Given a shot whose visual continuity evidence contains an error blocker
    When the operator attempts to approve the current visual package
    Then approval is refused while reject or request-changes decisions remain available for that exact package

  Scenario: a shot with an unapproved reference cannot be approved
    Given a shot whose pinned reference does not have matching approved reference evidence
    When the operator attempts to approve the current visual package
    Then approval is refused and no approved package record is appended

  Scenario: changing a shot field invalidates the approval
    Given an approved immutable visual package
    When a fingerprint-participating shot visual field changes
    Then the previous approval remains preserved but no longer approves the current package fingerprint

  Scenario: changing bible versions invalidates the approval
    Given an approved immutable visual package with pinned bible versions
    When a fingerprint-participating pinned bible version changes
    Then the previous approval remains preserved but no longer approves the current package fingerprint

  Scenario: approving a new snapshot invalidates approval
    Given an approved immutable visual package with approved reference evidence
    When the approved snapshot or approved bound reference evidence changes the package fingerprint
    Then the previous approval remains preserved but no longer approves the current package fingerprint

  Scenario: approval is append-only (superseded by new approval, never deleted)
    Given an approved visual package that later changes
    When the operator approves the new current package
    Then both decisions remain in approval history and the newer approval supersedes the older package for current validity

  Scenario: operator can see locked immutable approved package
    Given a visual package was approved and its current package later changes
    When the operator inspects visual package approval history
    Then the approved fingerprint and the immutable package snapshot recorded with that approval remain inspectable

  Scenario: offline mock must be able to drive the whole flow
    Given the real SQLite studio is configured with the offline mock provider and an exact visual package can be approved using existing reference evidence
    When the vertical slice runs through mock generation, asset approval, exact-package approval, timeline assembly and export
    Then the flow completes without a real provider or paid credential and records zero actual provider cost
