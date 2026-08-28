/**
 * Workflow runner.
 *
 * A workflow is a named, recorded sequence of the same services a human would
 * click through — not a parallel universe. Steps that need a human decision stop
 * with `awaiting-approval` instead of pretending to be done, which is what keeps
 * "80% automated, human keeps the creative calls" true.
 */
import { DomainError, notFound } from '@/domain/errors';
import { runWorkflowSchema, type RunWorkflowInput, type WorkflowStep } from '@/domain/schemas';
import type { WorkflowKey } from '@/domain/enums';
import type { Studio } from '../ports';
import type { WorkflowRunRecord } from '../records';
import { createExportService } from './exportService';
import { createGenerationService } from './generationService';
import { createPromptService } from './promptService';
import { createScriptService } from './scriptService';
import { createTimelineService } from './timelineService';
import { createContinuityService } from './continuityService';

interface StepDefinition {
  key: string;
  label: string;
  /** Returns a detail line, or throws. Returning `null` means "skipped". */
  run: (context: WorkflowContext) => Promise<string | null>;
  /** Human gate: the run pauses here rather than continuing. */
  humanGate?: boolean;
}

interface WorkflowContext {
  projectId: string;
  episodeId?: string;
  autoEnqueue: boolean;
  notes: string[];
}

export function createWorkflowService(studio: Studio) {
  const { workflows, projects, shots, prompts, scenes, activity } = studio;
  const scriptService = createScriptService(studio);
  const promptService = createPromptService(studio);
  const generationService = createGenerationService(studio);
  const timelineService = createTimelineService(studio);
  const continuityService = createContinuityService(studio);
  const exportService = createExportService(studio);

  const parseScenesStep: StepDefinition = {
    key: 'parse-scenes',
    label: 'Parse script into scenes',
    run: async (context) => {
      const existing = context.episodeId
        ? await scenes.listByEpisode(context.projectId, context.episodeId)
        : await scenes.listByProject(context.projectId);
      if (existing.length > 0) return `${existing.length} scene(s) already parsed — left untouched`;
      const result = await scriptService.parseIntoScenes(context.projectId, { episodeId: context.episodeId });
      return `${result.scenes.length} scene(s), ${result.createdCharacters.length} new character(s), ${result.createdLocations.length} new location(s)`;
    },
  };

  const buildShotsStep: StepDefinition = {
    key: 'build-shots',
    label: 'Generate shot coverage',
    run: async (context) => {
      const result = await scriptService.buildShots(context.projectId, context.episodeId);
      if (result.recommendations.length > 0) {
        context.notes.push(
          `Shot planner flagged ${result.recommendations.length} shot(s): ${result.recommendations
            .slice(0, 3)
            .map((entry) => `${entry.shotCode} (${entry.findings[0]?.rule})`)
            .join(', ')}`,
        );
      }
      return `${result.shots.length} shot(s) created`;
    },
  };

  const buildPromptsStep = (kind: 'image' | 'video'): StepDefinition => ({
    key: `build-${kind}-prompts`,
    label: `Compile ${kind} prompts with locks`,
    run: async (context) => {
      const result = await promptService.buildMissing(context.projectId, kind, context.episodeId);
      if (result.failures.length > 0) {
        context.notes.push(
          `${result.failures.length} ${kind} prompt(s) could not be built: ${result.failures
            .slice(0, 3)
            .map((failure) => `${failure.shotCode} — ${failure.reason}`)
            .join(' | ')}`,
        );
      }
      return `${result.built.length} ${kind} prompt(s) compiled, ${result.failures.length} failed`;
    },
  });

  const continuityStep: StepDefinition = {
    key: 'continuity-check',
    label: 'Continuity check',
    run: async (context) => {
      const report = await continuityService.forProject(context.projectId);
      if (report.errors > 0) {
        throw new DomainError(
          'MISSING_REFERENCE',
          `Continuity has ${report.errors} blocking error(s): ${report.findings
            .filter((finding) => finding.severity === 'error')
            .slice(0, 3)
            .map((finding) => finding.message)
            .join(' | ')}`,
        );
      }
      return `${report.errors} error(s), ${report.warnings} warning(s), ${report.infos} note(s)`;
    },
  };

  const enqueueStep = (kind: 'image' | 'video'): StepDefinition => ({
    key: `enqueue-${kind}`,
    label: `Queue ${kind} generations`,
    run: async (context) => {
      if (!context.autoEnqueue) return null;
      const shotList = context.episodeId
        ? await shots.listByEpisode(context.projectId, context.episodeId)
        : await shots.listByProject(context.projectId);
      let queued = 0;
      let skipped = 0;

      for (const shot of shotList) {
        const prompt = await prompts.findForShot(shot.id, kind);
        if (!prompt) {
          skipped += 1;
          continue;
        }
        try {
          const result = await generationService.enqueue({
            projectId: context.projectId,
            shotId: shot.id,
            promptId: prompt.id,
            kind,
            params: {},
            referenceAssetIds: [],
            priority: kind === 'image' ? 50 : 100,
          });
          if (!result.reused) queued += 1;
        } catch (error) {
          skipped += 1;
          context.notes.push(`${shot.code}: ${(error as Error).message}`);
        }
      }
      return `${queued} queued, ${skipped} skipped`;
    },
  });

  const approvalGate = (label: string): StepDefinition => ({
    key: `human-approval-${label.toLowerCase().replace(/\s+/g, '-')}`,
    label: `Human approval — ${label}`,
    humanGate: true,
    run: async () => `Waiting for the operator to approve ${label.toLowerCase()}`,
  });

  const timelineStep: StepDefinition = {
    key: 'timeline',
    label: 'Assemble timeline',
    run: async (context) => {
      const timeline = await timelineService.build(context.projectId, context.episodeId);
      return `${timeline.items.length} item(s), ${timeline.totalSeconds}s, ${timeline.missingCount} with missing media`;
    },
  };

  const exportStep: StepDefinition = {
    key: 'export',
    label: 'Export project package',
    run: async (context) => {
      const result = await exportService.run({ projectId: context.projectId, kind: 'project-package' });
      return `${result.export.kind} written (${result.warnings.length} warning(s))`;
    },
  };

  /** The six workflows from spec §23, expressed as the same building blocks. */
  const WORKFLOWS: Record<WorkflowKey, StepDefinition[]> = {
    'motion-comic': [
      parseScenesStep,
      buildShotsStep,
      buildPromptsStep('image'),
      continuityStep,
      enqueueStep('image'),
      approvalGate('panel keyframes'),
      timelineStep,
      exportStep,
    ],
    'stylized-3d': [
      parseScenesStep,
      buildShotsStep,
      buildPromptsStep('image'),
      continuityStep,
      enqueueStep('image'),
      approvalGate('keyframes'),
      buildPromptsStep('video'),
      enqueueStep('video'),
      timelineStep,
      exportStep,
    ],
    photoreal: [
      parseScenesStep,
      buildShotsStep,
      buildPromptsStep('image'),
      continuityStep,
      enqueueStep('image'),
      approvalGate('casting and wardrobe'),
      buildPromptsStep('video'),
      enqueueStep('video'),
      timelineStep,
      exportStep,
    ],
    product: [
      buildShotsStep,
      buildPromptsStep('image'),
      continuityStep,
      enqueueStep('image'),
      approvalGate('brand and packaging integrity'),
      buildPromptsStep('video'),
      enqueueStep('video'),
      exportStep,
    ],
    ugc: [parseScenesStep, buildShotsStep, buildPromptsStep('image'), enqueueStep('image'), timelineStep, exportStep],
    surreal: [
      buildShotsStep,
      buildPromptsStep('image'),
      enqueueStep('image'),
      approvalGate('transformation chain'),
      buildPromptsStep('video'),
      enqueueStep('video'),
      timelineStep,
      exportStep,
    ],
  };

  return {
    definitions: () =>
      Object.entries(WORKFLOWS).map(([key, steps]) => ({
        key: key as WorkflowKey,
        steps: steps.map((step) => ({ key: step.key, label: step.label, humanGate: Boolean(step.humanGate) })),
      })),

    async run(raw: unknown): Promise<WorkflowRunRecord> {
      const input = runWorkflowSchema.parse(raw);
      const { projectId, workflowKey, autoEnqueueGenerations, episodeId } = input;
      const project = await projects.byId(projectId);
      if (!project) throw notFound('Project', projectId);

      const definition = WORKFLOWS[workflowKey];
      if (!definition) throw notFound('Workflow', workflowKey);

      const steps: WorkflowStep[] = definition.map((step) => ({
        key: step.key,
        label: step.label,
        status: 'pending',
        detail: '',
        startedAt: null,
        finishedAt: null,
      }));

      let run = await workflows.start(
        project.id,
        input.workflowKey,
        { autoEnqueueGenerations: input.autoEnqueueGenerations, episodeId },
        steps,
      );
      const context: WorkflowContext = {
        projectId: project.id,
        episodeId,
        autoEnqueue: input.autoEnqueueGenerations,
        notes: [],
      };

      let failed = false;
      let paused = false;

      for (const [index, step] of definition.entries()) {
        const entry = steps[index];
        if (!entry) continue;

        if (failed || paused) {
          entry.status = 'skipped';
          entry.detail = failed ? 'skipped after an earlier failure' : 'waiting for the human gate above';
          continue;
        }

        entry.status = 'running';
        entry.startedAt = studio.clock.nowIso();
        run = await workflows.updateSteps(run.id, steps);

        try {
          const detail = await step.run(context);
          entry.finishedAt = studio.clock.nowIso();
          if (step.humanGate) {
            entry.status = 'awaiting-approval';
            entry.detail = detail ?? '';
            paused = true;
          } else if (detail === null) {
            entry.status = 'skipped';
            entry.detail = 'disabled for this run';
          } else {
            entry.status = 'completed';
            entry.detail = detail;
          }
        } catch (error) {
          entry.status = 'failed';
          entry.finishedAt = studio.clock.nowIso();
          entry.detail = error instanceof DomainError ? `${error.code}: ${error.message}` : (error as Error).message;
          failed = true;
        }
        run = await workflows.updateSteps(run.id, steps);
      }

      const status = failed ? 'failed' : paused ? 'running' : 'completed';
      const finished = await workflows.finish(
        run.id,
        status,
        { notes: context.notes, pausedAtHumanGate: paused },
        steps,
      );

      await activity.log({
        projectId: project.id,
        userId: null,
        action: `workflow.${status}`,
        targetType: 'workflow',
        targetId: finished.id,
        details: { workflowKey: input.workflowKey, notes: context.notes.length },
      });

      return finished;
    },

    async list(projectIdOrSlug: string) {
      const project = (await projects.byId(projectIdOrSlug)) ?? (await projects.bySlug(projectIdOrSlug));
      if (!project) throw notFound('Project', projectIdOrSlug);
      return workflows.listByProject(project.id);
    },

    async byId(id: string) {
      const run = await workflows.byId(id);
      if (!run) throw notFound('WorkflowRun', id);
      return run;
    },
  };
}

export type WorkflowService = ReturnType<typeof createWorkflowService>;
