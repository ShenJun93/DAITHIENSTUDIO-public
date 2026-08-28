# Behaviour specification for the Project module.
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link, so a scenario cannot quietly
# become aspirational.

Feature: Persistent project creation

  Scenario: Create a project and keep it after a reload
    Given the studio is running with an empty database
    When the operator creates a project titled "Triệu Ngốc — Kiểm Thử"
    And the project is read back from the database
    Then the project still exists with the same title
    And it has a Style Bible entry attached

  Scenario: Reject a project with an empty title
    When the operator submits a project with a blank title
    Then the project is not created
    And a validation error is returned
