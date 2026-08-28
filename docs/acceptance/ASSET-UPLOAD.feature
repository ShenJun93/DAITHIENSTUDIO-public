# Behaviour specification for the asset upload widget (TASK-007).
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link, so a scenario cannot quietly
# become aspirational.

Feature: Manual asset upload

  Scenario: Uploading a file through the action persists an asset and it survives a reload
    Given a project with no assets yet
    When the operator uploads a reference file
    Then reading the project's assets back returns it

  Scenario: An identical re-upload reuses the existing asset instead of creating a duplicate
    Given an uploaded asset
    When the operator uploads the same file bytes again
    Then the existing asset is returned instead of a new one being created

  Scenario: An empty file is refused with a validation error
    When the operator uploads a zero-byte file
    Then the upload is refused with a validation error

  Scenario: A file over the 50 MB limit is refused with a validation error
    When the operator uploads a file larger than 50 MB
    Then the upload is refused with a validation error

  Scenario: Uploading with a shot association stores the asset under that shot
    Given a shot in the project
    When the operator uploads a file associated with that shot
    Then the asset's shot id matches the shot it was uploaded for
