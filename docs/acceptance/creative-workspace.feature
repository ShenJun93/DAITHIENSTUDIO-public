Feature: Creative workspace overview
  The operator can understand a project's persisted production state without changing it.

  Scenario: Show persisted production type, journey, readiness, warnings and output profile
    Given a persisted project has production records
    When the operator opens its overview
    Then the overview shows only values derived from those records

  Scenario: Show an honest empty state without fabricated production values
    Given a persisted project has no production records
    When the operator opens its overview
    Then the overview explains the empty state without sample values

  Scenario: Read the workspace from persisted project records without writing production data
    Given a persisted project exists
    When its workspace read model is requested
    Then no project or production record is changed

  Scenario: Derive journey and warning summaries from the selected episode
    Given an episode has a parsed script, scenes and shots
    When its workspace read model is requested
    Then the journey and warnings reflect that episode

  Scenario: Character Browser empty state: a project with no characters yields zero entries without writing data
    Given a persisted project has no character bible entries
    When the operator opens the Character Browser
    Then it shows an empty state and changes no project record

  Scenario: Location Browser empty state: a project with no locations yields zero entries
    Given a persisted project has no location bible entries
    When the operator opens the Location Browser
    Then it shows an empty state

  Scenario: Location Browser: lockEnabled is null (unsupported), never a fabricated boolean
    Given a persisted location has no lock concept in the domain model
    When the Location Browser projects that location
    Then lock state is reported as unsupported rather than a guessed true or false

  Scenario: Character Browser populated state: derives non-zero scene and shot usage from persisted scenes/shots after script parsing, without hardcoding a project name
    Given a project has parsed scenes and shots that reference its characters and locations
    When the operator opens the Character Browser and the Location Browser
    Then each entry shows real scene and shot usage counts derived from those persisted records

  Scenario: Slice 2 entity browsers agree with the persisted Bible service on the same character/location counts (no divergent read model)
    Given a project has persisted characters and locations
    When the Character Browser and Location Browser and the Bible service are each read
    Then they report the same set of entities

  Scenario: Script / Scene Overview empty state: a project with an unparsed (unsaved) script yields zero scenes without writing data
    Given a persisted project has no parsed scenes
    When the operator opens the Script / Scene Overview
    Then it shows zero scenes and changes no project record

  Scenario: Script / Scene Overview populated state: scenes carry real script status/version and preserve their sequence, without hardcoding a project name
    Given a project has a saved and parsed script with scenes and shots
    When the operator opens the Script / Scene Overview
    Then each scene shows its real status, duration, shot count and character count in persisted sequence order

  Scenario: Shot Storyboard populated state: shot order preservation, and prompt/asset/render coverage derived from real records after a completed generation
    Given a shot has a compiled prompt and a completed generation with a produced asset
    When the operator opens the Shot Storyboard
    Then the shot shows its real prompt count, render status and asset coverage in persisted shot order

  Scenario: Shot Storyboard scene filter: narrows to one real scene by code without hardcoding it
    Given a project has multiple scenes with shots
    When the operator opens the Shot Storyboard filtered to one real scene code
    Then only that scene's shots are shown

  Scenario: Shot Storyboard scene filter with an unknown scene code: an honest empty result, never every shot
    Given the operator supplies a scene code that does not exist in the project
    When the Shot Storyboard is requested with that filter
    Then it shows zero shots rather than falling back to the unfiltered list
