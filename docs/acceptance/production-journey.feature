Feature: Production Journey — Journey Home read model, shell, guided phase views and Advanced Mode entry (Slices 1-4)
  Slice 1: a read-only, derived Production Journey projection over existing
  persisted data, observable directly against `productionJourneyService`.
  Slice 2: the Journey Home shell rendering that same read model on the
  existing Project Overview page (no new route, no second dashboard).
  Slice 3: the Guided Phase View — a current-phase explanation, completion
  criteria, module shortcuts and primary-action reference, rendered
  additively at the end of the Slice 2 shell.
  Slice 4: a Guided/Advanced presentation preference in the existing project
  shell; all existing navigation remains except that the Workflow affordance
  is surfaced only in Advanced Mode. Only scenarios matching an implemented
  slice are promoted here, per
  docs/product/PRODUCTION-JOURNEY-ACCEPTANCE-PLAN.md's Future Acceptance
  Promotion Rule — Slice 5 scenarios remain in that planning document, not
  promoted.

  Scenario: the current phase is derived from real project data, not a stored flag
    Given a project trieu-ngoc-tap-thu-nghiem with a parsed script and built shots but no compiled prompts
    When the operator opens the Project Overview
    Then the Produce phase is shown as the lowest-numbered populated priority band, computed fresh from persisted data

  Scenario: exactly one primary next action is shown
    Given a project with multiple simultaneously-true warning conditions
    When the operator opens the Project Overview
    Then exactly one action is presented as the primary next action, selected by the lowest populated priority band

  Scenario: every phase's module shortcut points at a real, already-existing route
    Given the Journey Home's Quick Access section for the Develop phase
    When the operator opens the Project Overview
    Then every link resolves to an existing route from docs/product/PRODUCTION-JOURNEY-CURRENT-INVENTORY.md, with none returning a 404

  Scenario: a new project with no episode shows Setup as the only actionable phase
    Given a newly created project with zero episodes
    When the operator opens the Project Overview
    Then all six phases render as Not Started and the primary action is to create the first episode

  Scenario: a fully complete project shows all six phases as Complete with no primary action
    Given a project with an accepted script, built shots, compiled prompts, approved assets, no continuity errors, and a successful export
    When the operator opens the Project Overview
    Then all six phases render as Complete and the primary action card shows the caught-up state instead of a recommendation

  Scenario: a project with a blocked generation provider shows the blocker before any Produce-phase warning
    Given a project with a compiled prompt but no provider available for the required generation capability
    When the operator opens the Project Overview
    Then the primary action is to configure a provider, shown ahead of any lower-priority Produce warning

  Scenario: the phase strip always shows all six phases regardless of project state
    Given a project in any state, from empty to fully complete
    When the operator opens the Project Overview
    Then the phase strip shows Setup, Develop, Plan, Produce, Review and Finish, in that order, with none hidden

  Scenario: a blocking condition renders as a non-dismissable blocker banner
    Given a project with a continuity error-severity finding
    When the operator opens the Project Overview
    Then the blocker banner names the exact blocking condition and links to /projects/trieu-ngoc-tap-thu-nghiem/continuity

  Scenario: a non-blocking condition renders as a warning with a resolution link
    Given a project with pending asset approvals and no blocking conditions
    When the operator opens the Project Overview
    Then the warning list shows the asset-review warning with a link to /projects/trieu-ngoc-tap-thu-nghiem/assets

  Scenario: a phase with no honest metric shows Unavailable instead of a fabricated percentage
    Given the Review phase, which has no single completion percentage defined in PRODUCTION-JOURNEY-PROGRESS.md
    When the operator opens the Project Overview
    Then the Review phase progress renders as "Unavailable", never as a numeric percentage

  Scenario: the phase strip and next-action card are keyboard-navigable
    Given the Project Overview is rendered
    When the operator navigates using Tab and Shift+Tab only
    Then every phase strip entry and the primary action button receive a visible focus ring and are reachable in a logical order

  Scenario: every phase strip entry has an accessible, screen-reader-readable label
    Given the Project Overview is rendered
    When a screen reader inspects the phase strip
    Then each phase announces its name and its current state as text, not colour alone

  Scenario: the Journey Home has no horizontal overflow at 1366x768
    Given the Project Overview is rendered on a 1366x768 viewport
    When the phase strip, next-action card, and warnings list are all visible
    Then no element causes horizontal scrolling or clipped content

  Scenario: the Journey Home makes correct use of extra width at 1920x1080
    Given the Project Overview is rendered on a 1920x1080 viewport
    When the phase strip, next-action card, and warnings list are all visible
    Then content remains within the existing max-w-6xl reading width and does not stretch edge-to-edge

  Scenario: Current phase view renders from the service result
    Given the Project Overview's Guided Phase View for the current phase
    When the operator opens the Project Overview
    Then the guided view renders directly from productionJourneyService's ProductionJourneyState, computing no new phase state itself

  Scenario: Correct phase explanation appears for all six phases
    Given each of the six Production Journey phases, in turn, as the current phase
    When the operator opens the Project Overview
    Then the guided view shows that phase's purpose and user question, copied verbatim from PRODUCTION-JOURNEY-PHASES.md

  Scenario: Completion criteria render with textual states
    Given a phase with a mix of complete, incomplete and blocked completion criteria
    When the operator opens the Project Overview
    Then each criterion shows its status as text — Complete, Incomplete, Blocked or Unavailable — never a fabricated percentage

  Scenario: Unsupported criteria do not appear complete
    Given a completion criterion with no field-level evidence in the read model, such as Setup's output profile fields
    When the operator opens the Project Overview
    Then that criterion is labelled Unavailable, never Complete, regardless of the phase's overall state

  Scenario: Shortcuts use existing routes only
    Given the guided view's module shortcuts for any of the six phases
    When the operator opens the Project Overview
    Then every shortcut resolves to a route already confirmed in docs/product/PRODUCTION-JOURNEY-CURRENT-INVENTORY.md, with none invented

  Scenario: No duplicate primary action is introduced
    Given a project with a primary action belonging to the current phase
    When the operator opens the Project Overview
    Then the guided view references that same action's exact route rather than selecting or rendering a second, independent primary action

  Scenario: Blockers and warnings are not fully duplicated from Slice 2
    Given a phase with an open blocker
    When the operator opens the Project Overview
    Then the guided view shows only a count of blockers and warnings for that phase, never repeating the full blocker or warning message already shown above it

  Scenario: Keyboard and accessible labels are present
    Given the guided phase view is rendered
    When the operator navigates using the keyboard or a screen reader inspects the section
    Then the section has a phase-naming accessible label, every shortcut and action link is a real, keyboard-reachable anchor element, and criteria are exposed as a semantic list

  Scenario: Guided Mode is the default presentation with no prior preference set
    Given an operator with no stored Guided/Advanced Mode preference
    When the operator opens any project's Overview for the first time
    Then the Journey Home renders in Guided Mode

  Scenario: Advanced Mode entry exposes the full existing project navigation without hiding it in Guided Mode
    Given an operator viewing the Project Overview in Guided Mode
    When the operator switches to Advanced Mode
    Then every existing nav group (Workspace, Develop, Produce, Finish) remains reachable in both modes, and the Workflow node-graph route becomes visible only in Advanced Mode
