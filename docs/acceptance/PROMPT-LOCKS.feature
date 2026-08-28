Feature: Prompts are compiled from pinned bible snapshots

  Scenario: Character Lock injects identity traits and pins the bible version
    Given a shot whose character is pinned to CHAR001_V2
    When the prompt is compiled
    Then the compiled text contains the character's identity traits and the version
    And the lock references record the exact character, style and location versions

  Scenario: Locks cannot be overridden by a hand-edited block
    Given an operator writes a different identity into the character block
    When the prompt is compiled
    Then the bible identity replaces the hand-written text

  Scenario: Negative rules from every locked entity are merged and de-duplicated
    When a prompt is compiled from a character, a style and a location
    Then their negative rules appear once each

  Scenario: Compiling the same blocks twice produces the same prompt
    Then prompt compilation is deterministic

  Scenario: A video prompt keeps motion blocks that an image prompt drops
    Then motion and camera movement appear only in the video prompt

  Scenario: Compile a prompt that carries Character, Style and Location locks
    Given a shot with a cast, a location and a project style
    When the prompt is compiled and stored
    Then version 1 exists with all three lock references and no blocking lint issue

  Scenario: Editing a character creates a new version without changing existing prompts
    Given a prompt compiled against CHAR001_V1
    When the character bible is edited
    Then a new snapshot version is created
    And the previously compiled prompt is unchanged

  Scenario: Recompiling a prompt adds a version instead of overwriting one
    When the prompt is compiled again
    Then a second prompt version is stored and the first is preserved

  Scenario: Re-pinning a shot to a newer bible version changes the compiled prompt
    Given every shot using the character is re-pinned to the new snapshot
    When the prompt is recompiled
    Then the compiled text reflects the new bible content

  Scenario: Block a prompt that has no action
    Then the linter reports action-missing as an error

  Scenario: Block a prompt that names a protected studio style
    Then the linter reports restricted-style-reference as an error

  Scenario: Allow soft global illumination without flagging it as a studio name
    Then the linter does not report restricted-style-reference

  Scenario: Block a prompt with contradictory instructions
    Then the linter reports a contradiction

  Scenario: Block a video prompt that describes no motion
    Then the linter reports motion-missing

  Scenario: Block a prompt for a shot with characters when Character Lock was not applied
    Then the linter reports character-lock-missing
