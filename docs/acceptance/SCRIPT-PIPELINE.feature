Feature: Script to scenes to shots

  Scenario: Parse a Vietnamese script into scenes, characters and dialogue
    Given a script using "CẢNH n - ĐỊA ĐIỂM - ĐÊM" headings
    When the deterministic parser runs
    Then each scene has a location, a time of day and its dialogue lines
    And a parenthetical is captured as the line's emotion

  Scenario: Parsing the same script twice produces identical output
    Given the same script text
    When it is parsed twice
    Then both results are identical

  Scenario: Report a warning when the script has no scene heading
    Given a script with no recognisable heading
    When it is parsed
    Then an implicit scene is created and a warning is reported

  Scenario: Support English INT and EXT scene headings
    Given a script written with "INT." and "EXT." headings
    When it is parsed
    Then both scenes are recognised with the right time of day

  Scenario: Parse a saved script into at least three scenes
    Given a saved script for the project
    When the operator parses it
    Then at least three scenes are stored
    And the characters and locations it names exist as draft bible entries

  Scenario: Refuse to re-parse over existing scenes without explicit confirmation
    Given the project already has scenes
    When the operator parses the script again without confirming a replace
    Then the request is rejected with a conflict
    And the existing scenes are untouched

  Scenario: Build a shot list where every shot pins a bible snapshot
    Given a project with parsed scenes
    When the operator builds shot coverage
    Then at least ten shots exist
    And every shot code matches EP01_SC01_SH001
    And every character reference carries a CHARnnn_Vn snapshot id
