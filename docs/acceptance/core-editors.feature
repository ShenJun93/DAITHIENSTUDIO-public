Feature: Core entity editors — Character create (Slice 1)
  The operator can manually create a Character through a real, persisted, validated
  form, without duplicating the existing update path at /projects/[slug]/bibles.

  Scenario: creates a character that persists and survives a reload, with a real server-assigned code
    Given the operator submits a valid character name on the Character create form
    When the create action runs
    Then a new character is persisted with a system-assigned code and survives a reload

  Scenario: rejects an empty name with a field-specific error, not a generic string, and creates nothing
    Given the operator submits the character create form with an empty name
    When the create action runs
    Then it returns a field-specific validation error and no character is created

  Scenario: a character created for project A never appears in project B (project ownership)
    Given two persisted projects exist
    When a character is created for the first project
    Then it never appears in the second project's character list

  Scenario: never accepts a client-supplied code: two characters get two distinct, sequential codes
    Given the character create form never exposes a code field
    When two characters are created in sequence
    Then each receives its own distinct, system-assigned code

  Scenario: resolves the real project from slug and 404s honestly for an unknown one, without any project-slug branching
    Given a project slug that does not exist
    When the Character create page is requested for that slug
    Then it resolves honestly to not found, with no project-specific branching

  Scenario: shows a real "New Character" link to the approved create route, and an updated empty hint, without any project-specific hardcoding
    Given the operator opens the Character Browser for any real project
    When the browser renders
    Then it shows a real "New Character" link to the create route and an accurate empty-state hint

Feature: Core entity editors — Location create (Slice 2)
  The operator can manually create a Location through a real, persisted, validated
  form, reusing the Slice 1 shared form foundation, without duplicating the existing
  update path at /projects/[slug]/bibles and without any Location Lock control.

  Scenario: creates a location that persists and survives a reload, with a real server-assigned code
    Given the operator submits a valid location name on the Location create form
    When the create action runs
    Then a new location is persisted with a system-assigned code and survives a reload

  Scenario: rejects an empty name with a field-specific error, not a generic string, and creates nothing
    Given the operator submits the location create form with an empty name
    When the create action runs
    Then it returns a field-specific validation error and no location is created

  Scenario: a location created for project A never appears in project B (project ownership)
    Given two persisted projects exist
    When a location is created for the first project
    Then it never appears in the second project's location list

  Scenario: never accepts a client-supplied code: two locations get two distinct, sequential codes
    Given the location create form never exposes a code field
    When two locations are created in sequence
    Then each receives its own distinct, system-assigned code

  Scenario: resolves the real project from slug and 404s honestly for an unknown one, without any project-slug branching
    Given a project slug that does not exist
    When the Location create page is requested for that slug
    Then it resolves honestly to not found, with no project-specific branching

  Scenario: shows a real "New Location" link to the approved create route, and an updated empty hint, without any project-specific hardcoding
    Given the operator opens the Location Browser for any real project
    When the browser renders
    Then it shows a real "New Location" link to the create route and an accurate empty-state hint

Feature: Core entity editors — Scene Editor
  The operator can edit a Scene's content fields through a real, persisted, validated
  form calling the accepted scriptService.updateScene, reusing the shared form
  foundation. Scene number, ownership and system-managed fields stay read-only.

  Scenario: an authorized allowed-field update succeeds and persists across reload
    Given the operator submits an allowed-field edit on the Scene Editor form
    When the update action runs
    Then the scene's allowed fields persist and survive a reload

  Scenario: scene number cannot be changed, even if a caller injects one into the form
    Given a caller injects a "number" value into the update form submission
    When the update action runs
    Then the scene's number is unchanged

  Scenario: ownership fields (code, id, episodeId) cannot be changed, even if a caller injects them into the form
    Given a caller injects code, id and episodeId values into the update form submission
    When the update action runs
    Then the scene's code, id and episodeId are unchanged and the allowed fields still save

  Scenario: unsupported fields (characters, dialogue) are excluded and never reach the persisted scene
    Given a caller injects characters and dialogue values into the update form submission
    When the update action runs
    Then the scene's characters and dialogue remain exactly as they were

  Scenario: an invalid payload (empty title) returns a field-specific error and leaves the scene unchanged
    Given the operator submits the Scene Editor form with an empty title
    When the update action runs
    Then it returns a field-specific validation error and the scene is left unchanged

  Scenario: updating a scene that belongs to a different project is refused, and the scene is left unchanged (project mismatch)
    Given two persisted projects each with their own scene exist
    When the update action is called with the wrong project
    Then it returns a stable not-found result and the scene is left unchanged

  Scenario: loads the authorized scene into the form with initial values, and excludes read-only/unsupported fields
    Given the operator opens the Scene Editor for an authorized scene
    When the page renders
    Then every allowed field shows its current value and no read-only or unsupported field is editable

  Scenario: shows a real Edit link per scene, without any project-specific hardcoding
    Given the operator opens the Scene list for any real project
    When the page renders
    Then it shows a real Edit link to the Scene Editor route for each scene

Feature: Core entity editors — Shot Editor
  The operator can edit a Shot's content fields through a real, persisted, validated
  form calling the accepted scriptService.updateShot, reusing the shared form
  foundation. Shot number, status, ownership and pinned bible-snapshot references
  stay read-only.

  Scenario: an authorized allowed-field update succeeds and persists across reload
    Given the operator submits an allowed-field edit on the Shot Editor form
    When the update action runs
    Then the shot's allowed fields persist and survive a reload

  Scenario: shot number cannot be changed, even if a caller injects one into the form
    Given a caller injects a "shotNumber" value into the update form submission
    When the update action runs
    Then the shot's shot number and sort index are unchanged

  Scenario: status cannot be changed, even if a caller injects one into the form
    Given a caller injects a "status" value into the update form submission
    When the update action runs
    Then the shot's status is unchanged and the allowed fields still save

  Scenario: ownership fields (projectId, sceneId, id) cannot be changed, even if a caller injects them into the form
    Given a caller injects projectId, sceneId and id values into the update form submission
    When the update action runs
    Then the shot's projectId, sceneId and id are unchanged

  Scenario: pinned character/location/prop references cannot be changed, even if a caller injects them into the form (forbidden-field injection)
    Given a caller injects hijacked character, location and prop references into the update form submission
    When the update action runs
    Then the shot's pinned character, location and prop references remain exactly as they were

  Scenario: generated asset relations are never touched by a shot content update
    Given a shot has a real asset registered against it
    When the update action runs
    Then the asset's shot assignment and approval state are unchanged

  Scenario: unsupported fields (visualEffects, soundEffects) are excluded and never reach the persisted shot
    Given a caller injects visualEffects and soundEffects values into the update form submission
    When the update action runs
    Then the shot's visualEffects and soundEffects remain exactly as they were

  Scenario: an invalid payload (unknown shot size) returns a field-specific error and leaves the shot unchanged
    Given the operator submits the Shot Editor form with an unknown shot size
    When the update action runs
    Then it returns a field-specific validation error and the shot is left unchanged

  Scenario: updating a shot with a scene it does not belong to is refused, and the shot is left unchanged (scene mismatch)
    Given a shot exists only in scene A
    When the update action is called asserting scene B
    Then it returns a stable not-found result and the shot is left unchanged

  Scenario: updating a shot that belongs to a different project is refused, and the shot is left unchanged (project mismatch)
    Given two persisted projects each with their own shot exist
    When the update action is called with the wrong project
    Then it returns a stable not-found result and the shot is left unchanged

  Scenario: loads the authorized shot into the form with initial values, and excludes read-only/unsupported fields
    Given the operator opens the Shot Editor for an authorized shot
    When the page renders
    Then every allowed field shows its current value and no read-only or unsupported field is editable

  Scenario: shows a real Edit link on the Shot Inspector page for the shot under test
    Given the operator opens the Shot Inspector for a real shot
    When the page renders
    Then it shows a real Edit link to the Shot Editor route

Feature: Core entity editors — Episode UI migration
  The already-shipped Episode create/update/delete UI (CreateEpisodeForm.tsx,
  EpisodeList.tsx) is migrated onto the shared form primitives (FormSection,
  ValidationSummary, FieldError, SaveBar, StatusSelect, useDirtyStateGuard) for
  visual/structural consistency with the Character, Location, Scene and Shot
  editors. Fields, actions, routes and domain behaviour are unchanged.

  Scenario: creates an episode and persists it
    Given the operator submits the Create episode form with a title
    When the create action runs
    Then the episode persists and appears in the project's episode list

  Scenario: returns a stable NOT_FOUND result for a project slug that does not exist, never a raw exception
    Given the create episode action is called with a project slug that does not exist
    When the action runs
    Then it returns a stable not-found result with no stack trace

  Scenario: updates title, synopsis and status, and persists them
    Given the operator submits an episode edit with a new title, synopsis and status
    When the update action runs
    Then the episode's title, synopsis and status persist

  Scenario: returns a stable NOT_FOUND result for an episode id that does not exist, never a raw exception
    Given the update episode action is called with an episode id that does not exist
    When the action runs
    Then it returns a stable not-found result with no stack trace

  Scenario: refuses to delete the last remaining episode in a project (CONFLICT)
    Given a project has exactly one episode
    When the operator tries to delete it
    Then the delete is refused with a CONFLICT result and the episode remains

  Scenario: deletes an episode when more than one exists
    Given a project has more than one episode
    When the operator deletes one of them
    Then it is removed from the project's episode list

  Scenario: renders the title field via the shared Field/FieldError primitives and a SaveBar labelled "Create episode", with no synopsis field (unchanged field scope)
    Given the Create episode form is rendered
    When its markup is inspected
    Then the title field, its label and a "Create episode" SaveBar are present and no synopsis field is exposed

  Scenario: renders every episode with its code/title, marks the active one, and exposes title/synopsis/status fields via the shared primitives
    Given a project has more than one episode, one of them active
    When the episode list is rendered
    Then every episode's code, title and active state are shown, and title/synopsis/status are editable through the shared primitives

  Scenario: shows a Delete episode control per row when more than one episode exists
    Given a project has more than one episode
    When the episode list is rendered
    Then each row shows its own Delete episode control

  Scenario: hides the Delete episode control when only one episode exists (guards the "keep at least one episode" rule)
    Given a project has exactly one episode
    When the episode list is rendered
    Then no Delete episode control is shown

  Scenario: shows a real Edit link per shot on the Shot list page, without any project-specific hardcoding
    Given the operator opens the Shot list for any real project
    When the page renders
    Then it shows a real Edit link to the Shot Editor route for each shot
