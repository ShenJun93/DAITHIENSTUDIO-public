Feature: AI-assisted production advisory (M9 initial slice, read-only)

  Scenario: Render advisory suggestions grouped by kind
    Given a project whose spend is near its cost ceiling
    When the operator opens the project's Advisory page
    Then suggestions render labelled by kind, derived from the project's real state

  Scenario: Show an empty state when the advisor has no signals to raise
    Given a fresh project with no continuity findings and no cost pressure
    When the operator opens the project's Advisory page
    Then the page states plainly that there are no suggestions right now

  Scenario: The Advisory page offers no mutation control
    Given a project with advisory suggestions rendered
    When the operator views the Advisory page
    Then no button, form or action is present that changes any production data
