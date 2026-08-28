# Behaviour specification for the Story Development module (TASK-004).
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link, so a scenario cannot quietly
# become aspirational.

Feature: Story development from a premise

  Scenario: Turn a premise into a logline, a synopsis and a beat sheet
    Given a project with no story development yet
    When the operator generates a story development from a premise
    Then the project has a logline, a synopsis and at least three beats

  Scenario: The story brief survives a reload
    Given a generated story development
    When the project is read back from the database
    Then the same logline, synopsis and beats are still there

  Scenario: Regenerating one part leaves the accepted parts untouched
    Given a generated story development with an accepted logline
    When the operator regenerates the synopsis
    Then the synopsis changes
    And the accepted logline is unchanged

  Scenario: An approved part cannot be silently overwritten
    Given a generated story development with an accepted logline
    When the operator tries to regenerate the accepted logline
    Then the regeneration is refused with a conflict error
    And the logline is unchanged

  Scenario: A provider failure leaves the existing brief intact
    Given a generated story development
    When the text provider fails during a regenerate
    Then the existing story brief is unchanged
    And a provider error is returned
