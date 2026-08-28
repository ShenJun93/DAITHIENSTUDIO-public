Feature: Shot Inspector IA7 technical audit
  As the local studio operator
  I want dense shot provenance consolidated in the Technical tab
  So that audit evidence is reachable without cluttering creator-facing workflow tabs

  Scenario: Technical evidence is consolidated behind progressive disclosure
    Given an existing shot has continuity and Visual Control evidence
    When the operator opens the Technical tab
    Then package and continuity fingerprints are available
    And continuity environment and findings evidence are available
    And dense technical sections are collapsed by default

  Scenario: Prompt provenance and asset lineage remain auditable
    Given image or video prompt provenance and shot assets exist
    When the operator opens the Technical tab
    Then prompt ids, versions and lockRef identifiers are available
    And the current decision rule id and reason are available
    And existing project-owned asset lineage links are reachable

  Scenario: Technical audit interactions are read only
    Given the operator is viewing Technical evidence
    When the operator expands sections or copies an audit value
    Then no application persistence is mutated
    And no generation job is created
    And no provider call is made

  Scenario: Creator-facing tabs remain free of new raw audit detail
    Given IA7 is implemented
    When the operator visits Overview, References, Prompts, Visual Control or Generations
    Then IA7 does not newly expose raw continuity JSON, fingerprint hex, prompt UUIDs or lockRef identifiers there by default
