# Behaviour specification for character bible editing (TASK-008).
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link, so a scenario cannot quietly
# become aspirational.

Feature: Edit a character bible entry

  Scenario: Editing a character's identity persists and survives a reload
    Given a draft character
    When the operator edits the character's identity and wardrobe
    Then reading the character back shows the edited fields

  Scenario: Editing a character writes a new version and the previous snapshot is still readable
    Given a draft character
    When the operator edits the character
    Then the character's version number increases
    And the previous version's snapshot is still readable

  Scenario: The compiled Character Lock text reflects an edited field
    Given a shot with a pinned character
    When the operator edits that character's costume and a prompt is rebuilt for the shot
    Then the compiled prompt contains the new costume

  Scenario: Editing with an empty name is rejected
    Given a draft character
    When the operator submits an edit with a blank name
    Then the character is not updated
    And a validation error is returned

  Scenario: An approved character can still be edited
    Given an approved character
    When the operator edits the approved character
    Then the edit succeeds and writes a new version
