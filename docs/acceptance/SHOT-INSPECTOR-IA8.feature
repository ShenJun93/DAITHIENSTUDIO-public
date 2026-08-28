Feature: Shot Inspector IA8 provider-safe preflight readiness
  IA8 explains provider, capability and estimated-cost risk without authorizing execution.

  Scenario: Mock baseline is explicit and zero-credit
    Given the configured default provider is mock
    When the operator opens the Prompts tab
    Then Preflight labels the path offline and zero-credit without a canary warning

  Scenario: Non-mock risk is explicit without execution authorization
    Given the configured default provider is not mock
    When the operator opens Preflight
    Then the server-owned provider path is labelled CANARY / PAID-RISK without authorizing generation

  Scenario: Capability mismatch is visible from descriptor truth
    Given the configured provider descriptor lacks the required image or video capability
    When Preflight is rendered
    Then the capability mismatch is visible without invoking a provider adapter

  Scenario: Canonical estimated request cost is visible
    Given current shot and compiled-prompt facts
    When Preflight is rendered
    Then the displayed request estimate is derived with the canonical estimateCostUsd function and labelled as an estimate

  Scenario: No false exact remaining-budget truth is introduced
    Given project budget reservation is authoritative inside atomic enqueue
    When Preflight is rendered
    Then no approximated exact remaining-budget value is displayed

  Scenario: Existing prompt blockers remain explanatory rather than authoritative execution gates
    Given existing prompt health is blocked or needs attention
    When Preflight is rendered
    Then the same existing prompt-health evidence is explained without creating a second execution authority

  Scenario: Preflight interactions are zero-credit and zero-mutation
    Given the operator opens or reads Preflight
    Then no Server Action, enqueue, provider call, persistence mutation or credential mutation occurs

  Scenario: Existing Shot Inspector workflow remains structurally intact
    Given IA1 through IA7 and IA6B are integrated
    When IA8 readiness is present
    Then Overview, References, Prompts, Visual Control, Generations and Technical remain available with existing behavior
