# Behaviour specification for location/prop/style bible editing (TASK-009).
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link, so a scenario cannot quietly
# become aspirational.

Feature: Edit a location, prop or style bible entry

  Scenario: Editing a location's prompt block persists and reaches a compiled prompt
    Given a shot at a location
    When the operator edits the location's prompt block and a prompt is rebuilt for the shot
    Then the compiled prompt contains the new location text

  Scenario: Editing a prop's material persists and reaches a compiled prompt
    Given a shot holding a prop
    When the operator edits the prop's material and a prompt is rebuilt for the shot
    Then the compiled prompt contains the new material

  Scenario: Editing a style's prompt block persists and reaches a compiled prompt
    Given a shot using a style
    When the operator edits the style's prompt block and a prompt is rebuilt for the shot
    Then the compiled prompt contains the new style text

  Scenario: Assigning a prop's owner character persists and survives a reload
    Given a prop and a character
    When the operator assigns the prop to the character
    Then reading the prop back shows the assigned owner

  Scenario: Editing a location, prop or style with an empty name is rejected
    Given a location, a prop and a style
    When the operator submits an edit with a blank name for each
    Then none of them are updated
    And a validation error is returned for each
