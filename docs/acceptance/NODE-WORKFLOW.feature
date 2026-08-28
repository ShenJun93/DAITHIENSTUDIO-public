Feature: Constrained node workflow editing

  Scenario: Save and reload a bounded node workflow
    Given a project owns a draft graph made only of approved studio operations
    When the operator saves and reloads the workflow
    Then its validated nodes, edges and version persist for that project only
