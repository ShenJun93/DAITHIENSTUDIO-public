# Production Journey — Phase Model

Status: PLANNING EVIDENCE (TASK-UI-PRODUCTION-JOURNEY-001). Documentation
only. Every "existing modules" and "required inputs" entry below points at
a module confirmed real in
`docs/product/PRODUCTION-JOURNEY-CURRENT-INVENTORY.md`. Nothing here
proposes a new service method, a new field, or a new persisted state.

## Relationship to the existing Project Journey

`docs/product/UI-INFORMATION-ARCHITECTURE.md` §3 already documents a
10-stage **Project Journey** (`Brief → Script → Scenes → Bibles →
Storyboard → Shots → Media → Timeline → QC → Export`), and
`creativeWorkspaceService.overview()` already computes an 8-stage variant
of it (`project, bibles, script, scenes, shots, media, timeline, export`)
rendered today by `WorkspaceOverview.tsx`. The six Production Journey
phases below are **not a competing progress model** — each phase is a
grouping label placed *over* one or more of these existing stages, the
same way a folder groups files without renaming them. See
`docs/decisions/ADR-012-production-journey-navigation.md` for the full
reconciliation decision and
`docs/product/PRODUCTION-JOURNEY-PROGRESS.md` for how phase-level progress
is computed strictly from this existing stage data, never a second
computation.

| Production Journey phase | Existing journey stage(s) it groups |
| --- | --- |
| Setup | (none directly — Setup covers Project/Output Profile fields the existing journey does not itself stage; see below) |
| Develop | `bibles`, `script` |
| Plan | `scenes`, part of `shots` |
| Produce | part of `shots`, `media` |
| Review | (no dedicated existing stage — reuses `readiness`/`warnings`, not the `journey` array) |
| Finish | `timeline`, `export` |

Setup and Review have no corresponding entry in the existing `journey`
array. This is reported honestly in each phase's section below, not
invented.

## Setup

**Purpose:** confirm the project's identity and output intent before any
creative content work begins.

**User question answered:** "What am I making, and for where?"

**Existing modules (from the inventory):**
- Project creation (`/projects`, `createProjectAction`).
- Project Overview's Output Profile card (`platform`, `aspectRatio`,
  `resolution`, `frameRate`, `durationTargetSeconds`, `language`,
  `targetAudience`, `genre`, `secondaryAspectRatios` — all read from the
  persisted `Project` record via `creativeWorkspaceService.overview`).
- First-episode creation (inline on Project Overview,
  `createEpisodeAction`) — a project with zero episodes cannot progress to
  Develop, so creating the first episode is the practical exit action of
  Setup even though `EpisodeList`/`CreateEpisodeForm` are the same
  components Develop uses for ongoing episode management.

**Required inputs:** a persisted `Project` row (title, format, platform,
aspect ratio, language at minimum — the exact required-vs-optional field
set is `createProjectSchema`/`updateProjectSchema` in
`src/domain/schemas.ts`, not re-derived here) and at least one `Episode`.

**Exit criteria:** project exists, output profile fields are populated
(not fabricated as "complete" if a field is genuinely absent — see
`PRODUCTION-JOURNEY-PROGRESS.md`), and at least one episode exists.

**Progress signals:** count-based only — "output profile fields present"
and "episode count ≥ 1." No percentage is fabricated (see Progress model).

**Blocking conditions:** no episode exists yet — every later phase's
per-episode read paths (`creativeWorkspaceService.overview(slug,
episodeId)`) require an `activeEpisodeId`.

**Warnings:** none currently computed by `creativeWorkspaceService` map to
Setup specifically; the closest existing warning kind is
`hasProductionData` being `false` (empty-data notice, links to `/story`).

**Recommended actions:** "Create your first episode" (if zero episodes)
or "Review output profile" (if profile fields are empty) — both point at
real, already-implemented actions.

**Unavailable capabilities:** production-type onboarding ("what are you
making" using the `PRODUCTION-TYPE-TEMPLATES.md` eight-type vocabulary) is
`PLANNED`, not implemented — today `project.format` (`PROJECT_FORMATS`,
eight different values) is the only persisted production-type-like field,
and the Overview does not yet render a capability badge next to it (a real
gap named in the inventory).

**Planned capabilities:** capability badges (`AVAILABLE`/`PARTIAL`/
`PLANNED`/`DEFERRED`) next to the production type, per
`UI-INFORMATION-ARCHITECTURE.md` §2 — not built yet.

## Develop

**Purpose:** build the narrative and canon foundation — script, episodes,
and the Character/Location/Prop/Style bibles a production draws identity
and continuity from.

**User question answered:** "What is the story, and who/where is in it?"

**Existing modules:**
- Story Development (`/projects/[slug]/story`, `createStoryService`).
- Script (`/projects/[slug]/script`, `createScriptService`).
- Episode management (inline, `episodeService`).
- Character Browser + create (`/workspace/characters`,
  `/workspace/characters/new`).
- Location Browser + create (`/workspace/locations`,
  `/workspace/locations/new`).
- Bibles update, all four kinds (`/bibles`, `updateCharacterAction` etc.).
- Bible version history (`/bibles/[kind]/[id]/history`) — the "canon"
  record: what a Character/Location/Prop/Style looked like at each pinned
  version.

**Required inputs:** a script document (`ScriptDocument`), at least one
parsed `Scene` (script parsing is the bridge from Develop into Plan), and
whichever Character/Location/Prop/Style bible entries the story actually
references.

**Exit criteria:** script saved and parsed at least once; the bible
entries referenced by the parsed scenes exist (not necessarily "locked" —
locking is a later Review-phase concern per
`UI-INFORMATION-ARCHITECTURE.md` §7 `LOCKED` status).

**Progress signals:** `creativeWorkspaceService.overview`'s existing
`script-empty`/`script-unparsed` warning kinds directly cover this phase's
blocking state; bible-entry counts (`workspace.counts.bibles`) are a real
count-based signal.

**Blocking conditions:** script empty or unparsed (existing warning
kinds); a parsed scene referencing a character/location that has no bible
entry (not currently a distinct warning kind — see
`PRODUCTION-JOURNEY-DATA-GAPS.md`).

**Warnings:** `script-empty`, `script-unparsed` (both existing,
`creativeWorkspaceService.overview`).

**Recommended actions:** "Write or paste your script" (script empty),
"Parse script into scenes" (script unparsed), "Add a Character/Location
bible entry" (referenced entity missing — real create routes exist).

**Unavailable capabilities:** Prop and Style bible **create** routes do
not exist (only update, on `/bibles`) — confirmed in the inventory; a
Develop-phase "Add a Prop" or "Add a Style" recommended action has no
valid target route today and must not be offered (see the Next-Action
spec's "no action without a valid target route" rule).

**Planned capabilities:** none named beyond the existing
`PRODUCT-TRACEABILITY.md` DEFERRED rows for full Character/Location/Prop/
Style editors.

## Plan

**Purpose:** turn the script and bibles into a shootable shot list —
scenes broken into shots, storyboarded and continuity-checked before
generation spend.

**User question answered:** "What exactly needs to be generated, shot by
shot?"

**Existing modules:**
- Scene Board, read-only (`/workspace/scenes`,
  `creativeWorkspaceService.sceneBoard`).
- Scene list + editor (`/scenes`, `/scenes/[code]/edit`).
- Shot Storyboard, read-only (`/workspace/shots`,
  `creativeWorkspaceService.shotStoryboard`).
- Shot list + editor (`/shots`, `/shots/[code]/edit`, reorder via
  `reorderShotsAction`, "Build missing coverage" via `buildShotsAction`).
- Production Strategy's consistency-gate anchors and binding provenance
  (`/production`) — the closest existing continuity-planning surface.

**Required inputs:** parsed scenes (from Develop) and a built shot list
(`buildShotsAction`, one shot per scene at minimum).

**Exit criteria:** every scene has at least one shot; shots missing
required planning fields (per `creativeWorkspaceService`'s
`CreativeShotSummary.warnings`) are resolved or explicitly accepted.

**Progress signals:** count-based — `workspace.counts.scenes`,
`workspace.counts.shots`; `readiness.readyShots`/`readiness.totalShots`
(already computed).

**Blocking conditions:** existing warning kind `scenes` (scenes exist but
no shots built yet) and `shots` (from `creativeWorkspaceService.overview`).

**Warnings:** `scenes`, `shots`, `anchors` (missing consistency-gate
anchors — existing warning kind, surfaced on `/production`).

**Recommended actions:** "Build shots for this scene" (`buildShotsAction`,
real), "Resolve missing anchor" (links to `/production`, real).

**Unavailable capabilities:** drag/reorder on the read-only Storyboard is
explicitly out of scope per `UI-INFORMATION-ARCHITECTURE.md` §4 (only the
mutation-capable `/shots` list supports reorder); scene reorder is
`UNSUPPORTED` entirely (no `reorderScenesAction` exists anywhere).

**Planned capabilities:** timing/duration estimation is named as a
possible future `src/domain/**` extraction in
`docs/integration/NODEPLOT-INTEGRATION-ROADMAP.md` Phase 1
(`TASK-NODEPLOT-TIMING-LOGIC-EXTRACTION-001`, BACKLOG/UNAPPROVED) — not
implemented; today duration is operator-entered only.

## Produce

**Purpose:** compile prompts and generate the actual image/video/voice
assets for each shot.

**User question answered:** "Is the media for this shot actually made
yet, and what's still queued?"

**Existing modules:**
- Prompt compilation actions (Overview's "Compile image/video prompts";
  Shot Inspector's per-shot "Compile/Recompile").
- Assets page (`/assets`, upload + grid).
- Render Queue (`/queue`, job status, cancel, "Process pending jobs").
- Voice Studio (`/voice`) and Sound Studio (`/sound`) — optional per
  production type (per `PRODUCTION-TYPE-TEMPLATES.md`'s per-type "Audio
  requirements").
- Workflow run ("Run motion-comic workflow" on Overview; `/workflow` node
  graph authoring, Advanced-only, no execution).

**Required inputs:** compiled prompts (`promptService.buildMissing`/
`buildForShot`) for the shots being produced; a configured, `AVAILABLE`
provider (per `docs/architecture/CAPABILITY-MODEL.md` resolution input 4,
"Provider availability").

**Exit criteria:** every eligible shot has a compiled prompt and, for
Guided flows, a completed generation job producing an approved-or-pending
asset (see `PRODUCTION-JOURNEY-PROGRESS.md` for the exact "prompt
readiness"/"asset coverage" metric definitions).

**Progress signals:** `readiness.readyForCompose`, per-shot
`CreativeShotSummary.promptCount`/`generationStatus`/`assetCoverage`
(all existing, from `shotStoryboard`).

**Blocking conditions:** existing warning kind `generation-failures`; a
provider resolving `BLOCKED` (per Capability Model) — e.g. no configured
provider reports the required capability.

**Warnings:** `shot-media` (shots missing generated media),
`generation-failures` (both existing warning kinds).

**Recommended actions:** "Compile missing prompts" (`buildPromptsAction`,
real), "Process pending jobs" (`drainQueueAction`, real).

**Unavailable capabilities:** node-graph **execution** does not exist
(ADR-007 explicit non-goal) — a Produce-phase action can never say "run
your custom workflow graph"; only the six hard-coded `workflowService`
keys are executable, and only `motion-comic` has a UI trigger today (a
gap named in the inventory).

**Planned capabilities:** `WorkflowTemplate`/`NodeRegistry` data-driven
execution (`WORKFLOW-ARCHITECTURE.md` Phase 4–5, both `PLANNED`, no
implementation authority from this task).

## Review

**Purpose:** confirm continuity, quality and approval state before
assembling a deliverable — the checkpoint between "generated" and
"ready to finish."

**User question answered:** "Is anything wrong, and has a human signed
off?"

**Existing modules:**
- Project Overview's Readiness and Warnings cards (aggregate view).
- Continuity dashboard (`/continuity`).
- Asset Approve/Reject/QC actions (`/assets` grid, and inline on Shot
  Inspector — `decideAssetAction`, `checkQualityAction`).
- Bible version history (`/bibles/[kind]/[id]/history`) as continuity
  evidence.

**Required inputs:** generated assets awaiting a decision
(`workspace.counts.pendingAssets`); continuity findings
(`continuityService.forProject`).

**Exit criteria:** `readiness.readyForCompose === true` and zero unresolved
continuity `error`-severity findings (continuity severities are the
existing `error`/`warning`/`note`/`violation` stat kinds already shown on
`/continuity`).

**Progress signals:** `workspace.counts.approvedAssets` /
`workspace.counts.pendingAssets` (count-based); continuity stat counts
(existing).

**Blocking conditions:** existing warning kind `asset-review` (pending
approvals); a continuity `error`-severity finding blocking generation
(per `/continuity`'s own "blocked/allowed" notice).

**Warnings:** `asset-review` (existing warning kind).

**Recommended actions:** "Review pending assets" (`/assets`, real),
"Review continuity findings" (`/continuity`, real).

**Unavailable capabilities:** there is no dedicated Review *screen*
combining continuity + asset QC + readiness in one place — today an
operator visits three separate pages (Overview, `/continuity`, `/assets`)
to complete a review pass; `UI-INFORMATION-ARCHITECTURE.md` §8 names an
"advanced approval center" as explicitly not authorized by UI-1.

**Planned capabilities:** advanced approval center
(`PRODUCT-TRACEABILITY.md`, DEFERRED row "Advanced approval center").

## Finish

**Purpose:** assemble the timeline, export the deliverable and, where
applicable, publish it.

**User question answered:** "Is this ready to hand off, and did the
handoff succeed?"

**Existing modules:**
- Timeline & Export (`/export` — "Rebuild timeline", export-profile
  buttons, FFmpeg "Compose Video", export history, inline `PublishForm`).

**Required inputs:** a project package the export step can freeze
(`exportService.buildPackage`) — requires shots with approved assets and
a valid timeline.

**Exit criteria:** at least one successful `ExportRecord`; if publishing
is used, a `publish.success` activity log entry (not merely attempted —
`publishService` caps retries at 3 and records `publish.failed`
explicitly).

**Progress signals:** export history list (existing, on `/export`);
export/publish status per record (existing `ExportRecord`/publish status
fields).

**Blocking conditions:** existing warning kind `export`-adjacent gaps —
`creativeWorkspaceService.overview` does not currently emit a distinct
"export not ready" warning kind by that exact name (see Data Gaps) even
though `UI-INFORMATION-ARCHITECTURE.md` §6 lists "export readiness" as an
intended readiness check; today the closest real signal is
`readiness.readyForCompose` plus the Timeline's own "missing media"
display.

**Warnings:** none of the eight existing `creativeWorkspaceService`
warning kinds is Finish-specific; this is a named data gap (see
`PRODUCTION-JOURNEY-DATA-GAPS.md`), not fabricated here.

**Recommended actions:** "Rebuild timeline" (`buildTimelineAction`,
real), "Run export" (`runExportAction`, real).

**Unavailable capabilities:** a standalone publishing control center
(`UI-INFORMATION-ARCHITECTURE.md` §1, listed under "Future tools") does
not exist — publishing is a form embedded per completed export row, not a
dedicated surface.

**Planned capabilities:** localization (dubbing/subtitle-per-locale
workflow) is **not represented anywhere** in the current schema or
services beyond the single `language` field on `Project` and the `srt`
export profile — `UNSUPPORTED` today, named as a real product gap in
`PRODUCTION-JOURNEY-DATA-GAPS.md`, not invented as a Finish-phase feature.
