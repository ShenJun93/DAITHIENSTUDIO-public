# Behaviour specification for the Voice Studio module (TASK-006).
#
# Every `Scenario:` name below must exist as a test title in tests/**.
# `npm run acceptance:check` enforces that link, so a scenario cannot quietly
# become aspirational.

Feature: Voice profiles and voice generation

  Scenario: Creating a voice profile persists it and survives a reload
    Given a project with no voice profiles yet
    When the operator creates a voice profile
    Then reading the project's voice profiles back returns it

  Scenario: Assigning a voice profile to a character survives a reload
    Given a character and a voice profile
    When the operator assigns the profile to the character
    Then reading the character back shows the assigned profile

  Scenario: Queuing a voice generation produces a voice asset for the shot
    Given a shot with dialogue
    When the operator queues a voice generation and the worker drains the queue
    Then a voice asset is linked to that shot

  Scenario: An identical voice request is not spent twice
    Given a shot with dialogue and a queued voice generation
    When the operator queues the same voice request again
    Then the existing job is reused instead of a new one being created

  Scenario: Creating a voice profile with a blank name is rejected
    When the operator submits a voice profile with a blank name
    Then the voice profile is not created
    And a validation error is returned
