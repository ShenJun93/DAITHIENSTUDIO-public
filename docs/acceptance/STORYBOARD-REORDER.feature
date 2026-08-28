# Behaviour specification for storyboard drag-and-drop reordering (TASK-005).
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link, so a scenario cannot quietly
# become aspirational.

Feature: Reorder shots within a scene

  Scenario: Reordering shots within a scene persists and survives a reload
    Given a scene with more than one shot
    When the operator drags a shot to a new position in the scene
    Then the new order is stored
    And reading the scene's shots back returns the same order

  Scenario: A reorder never changes a shot's code or shot number
    Given a scene with more than one shot
    When the operator reorders the shots
    Then every shot keeps its original code and shot number

  Scenario: The timeline reflects the reordered shot sequence
    Given a scene with more than one shot
    When the operator reorders the shots and rebuilds the timeline
    Then the timeline items follow the new order

  Scenario: Shot-list and voice-script exports reflect the reordered sequence
    Given a scene with more than one shot
    When the operator reorders the shots and exports the project package
    Then the exported shot order matches the new order

  Scenario: Reordering refuses a shot id that does not belong to the scene
    Given a scene with more than one shot
    When the operator submits a reorder that references a shot from another scene
    Then the reorder is refused with a validation error
