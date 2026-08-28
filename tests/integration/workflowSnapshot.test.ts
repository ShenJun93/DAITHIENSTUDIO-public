/**
 * Workflow Snapshot Regression Check (TASK-Q07).
 * Verifies that a completed WorkflowRun stores its steps as a snapshot,
 * so later changes to the WORKFLOWS definition do not alter history.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('workflow-snapshot');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createWorkflowService } = await import('@/application/services/workflowService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const workflow = createWorkflowService(studio);

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('workflow snapshot (TASK-Q07)', () => {
  it('A completed run’s stored steps are unaffected by later WORKFLOWS definition changes', async () => {
    // 1. Setup a project
    const project = await projects.create({
      title: 'Workflow Snapshot Test',
      description: '',
      aspectRatio: '16:9',
      durationTargetSeconds: 30,
      stylePresetKey: STYLE_PRESETS[0]?.key ?? 'none',
    });

    // 2. Run a workflow that should complete quickly (e.g. ugc)
    // We expect it to finish or fail, but importantly, it creates a run record.
    const run = await workflow.run({
      projectId: project.id,
      workflowKey: 'ugc',
      autoEnqueueGenerations: false,
    });

    expect(run.id).toBeTruthy();
    expect(run.steps.length).toBeGreaterThan(0);

    const originalStepsCount = run.steps.length;
    const originalFirstStepLabel = run.steps[0]?.label;

    // 3. To simulate changing the WORKFLOWS definition in code, we will monkey-patch the
    // `WORKFLOWS` definition if possible. Wait, `WORKFLOWS` is locked inside `createWorkflowService`.
    // Instead of monkey-patching `WORKFLOWS`, we can modify what `workflow.definitions()` returns? No, definitions() just returns a mapped array.
    // However, if the service re-reads WORKFLOWS on read, it would break. We want to prove that
    // EVEN IF the in-memory WORKFLOWS changed, retrieving the run from DB returns the original steps.
    // Since we cannot easily mutate the const `WORKFLOWS` in closure, we can prove snapshotting by manually updating the DB
    // to simulate a past run with a step that no longer exists in `WORKFLOWS`, and ensure it loads intact.

    // Let's add a fake step to the run directly in the repository to simulate an older workflow definition.
    const runId = run.id;
    const fakeStep = {
      key: 'legacy-step',
      label: 'A step that existed in the past but was removed',
      status: 'completed' as const,
      detail: 'Done',
      startedAt: studio.clock.nowIso(),
      finishedAt: studio.clock.nowIso(),
    };

    const mutatedSteps = [fakeStep, ...run.steps];
    await studio.workflows.updateSteps(runId, mutatedSteps);

    // Now retrieve the run via the service
    const retrieved = await workflow.byId(runId);

    // It should contain the legacy step exactly as stored, proving that the service
    // does not cross-reference or trim steps based on the current live `WORKFLOWS` definition.
    expect(retrieved.steps.length).toBe(originalStepsCount + 1);
    expect(retrieved.steps[0]?.key).toBe('legacy-step');
    expect(retrieved.steps[0]?.label).toBe('A step that existed in the past but was removed');

    // Also check the second step is untouched
    expect(retrieved.steps[1]?.label).toBe(originalFirstStepLabel);
  });
});
