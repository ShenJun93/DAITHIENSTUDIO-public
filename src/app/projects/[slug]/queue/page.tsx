/** Render Queue — job lifecycle, provider, model and cost, all visible. */
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { cancelGenerationAction, drainQueueAction } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { Badge, Card, DataTable, EmptyState, Notice, Stat, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function QueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const [jobs, counts, spent] = await Promise.all([
    studio.generations.listByProject(project.id, { limit: 200 }),
    studio.generations.countByStatus(project.id),
    studio.generations.spentUsd(project.id),
  ]);
  const shots = await studio.shots.listByProject(project.id);
  const shotCode = new Map(shots.map((shot) => [shot.id, shot.code]));

  const totalJobs = (['pending', 'processing', 'completed', 'failed', 'cancelled'] as const).reduce(
    (sum, status) => sum + (counts[status] ?? 0),
    0,
  );
  const isTruncated = totalJobs > jobs.length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(['pending', 'processing', 'completed', 'failed', 'cancelled'] as const).map((status) => (
          <Stat key={status} label={status} value={counts[status] ?? 0} />
        ))}
      </div>

      <Notice tone="info">
        Spent ${spent.toFixed(4)} of the ${project.costLimitUsd.toFixed(2)} project ceiling. The mock provider costs
        nothing — switch providers in <code>.env</code>.
      </Notice>

      {isTruncated && (
        <Notice tone="warning">
          Showing the {jobs.length} most recent jobs of {totalJobs} total. Older completed/failed/cancelled jobs are
          not listed here — the status counts above remain the true totals.
        </Notice>
      )}

      <Card
        title={`Jobs (${jobs.length})`}
        action={<ActionButton action={drainQueueAction.bind(null, slug)} label="Process pending jobs" pendingLabel="Processing…" />}
      >
        {jobs.length === 0 ? (
          <EmptyState title="The queue is empty" hint="Queue a generation from a shot." />
        ) : (
          <DataTable head={['Status', 'Kind', 'Shot', 'Provider / model', 'Attempts', 'Est.', 'Actual', 'Error', '']}>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-line/60 align-top">
                <td className="px-2 py-2">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-2 py-2 text-ink-mid">{job.kind}</td>
                <td className="px-2 py-2 font-mono text-xs text-ink-lo">
                  {job.shotId ? (shotCode.get(job.shotId) ?? 'deleted shot') : '—'}
                </td>
                <td className="px-2 py-2">
                  <Badge>{`${job.provider}/${job.model}`}</Badge>
                </td>
                <td className="px-2 py-2 tabular-nums text-ink-mid">
                  {job.attempts}/{job.maxAttempts}
                </td>
                <td className="px-2 py-2 tabular-nums text-ink-mid">${job.estimatedCostUsd.toFixed(4)}</td>
                <td className="px-2 py-2 tabular-nums text-ink-mid">${job.actualCostUsd.toFixed(4)}</td>
                <td className="px-2 py-2 text-xs text-red-700 dark:text-red-400">
                  {job.errorCode ? `${job.errorCode}: ${job.errorMessage ?? ''}` : ''}
                </td>
                <td className="px-2 py-2">
                  {(job.status === 'pending' || job.status === 'processing') && (
                    <ActionButton
                      action={cancelGenerationAction.bind(null, slug, job.id)}
                      label="Cancel"
                      variant="danger"
                      confirm="Cancel this job?"
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
