/** Timeline assembly and export. Exports freeze the versions actually used. */
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createTimelineService } from '@/application/services/timelineService';
import { createExportService } from '@/application/services/exportService';
import { createPublishService } from '@/application/services/publishService';
import { approveExportAction, buildTimelineAction, runExportAction } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { ComposeVideoForm } from './ComposeVideoForm';
import { PublishForm } from './PublishForm';
import { Fragment } from 'react';
import { Badge, Card, DataTable, EmptyState, Notice, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const EXPORT_KINDS = ['project-package', 'shot-list', 'srt', 'edl', 'voice-script'] as const;

export default async function ExportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const [timeline, exportsList, publishesList] = await Promise.all([
    createTimelineService(studio).current(slug),
    createExportService(studio).list(slug),
    createPublishService(studio).list(project.id),
  ]);

  const items = timeline?.items ?? [];
  const missing = items.filter((item) => item.missing.length > 0);

  const completedExports = exportsList.filter((record) => record.status === 'completed');
  const approvedExportIds = new Set<string>();
  for (const record of completedExports) {
    const approved = (await studio.approvals.listForTarget(project.id, 'export', record.id)).some(
      (approval) => approval.decision === 'approved' && approval.decidedBy,
    );
    if (approved) approvedExportIds.add(record.id);
  }

  return (
    <div className="space-y-5">
      <Card
        title={`Timeline (${items.length} items)`}
        action={<ActionButton action={buildTimelineAction.bind(null, slug)} label="Rebuild timeline" variant="ghost" />}
      >
        {items.length === 0 ? (
          <EmptyState title="No timeline yet" hint="Build shots first, then rebuild the timeline." />
        ) : (
          <>
            {missing.length > 0 && (
              <Notice tone="warning">
                {missing.length} item(s) are missing media. They stay in the timeline so the gap is visible rather than
                silently dropped.
              </Notice>
            )}
            <div className="mt-3">
              <DataTable head={['#', 'Shot', 'Start', 'Dur', 'Video', 'Voice', 'Missing', 'Subtitle']}>
                {items.map((item) => (
                  <tr key={item.shotId} className="border-b border-line/60 align-top">
                    <td className="px-2 py-1.5 tabular-nums text-ink-lo">{item.order + 1}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-ink-hi">{item.shotCode}</td>
                    <td className="px-2 py-1.5 tabular-nums text-ink-mid">{item.startSeconds}s</td>
                    <td className="px-2 py-1.5 tabular-nums text-ink-mid">{item.durationSeconds}s</td>
                    <td className="px-2 py-1.5">{item.videoAssetId ? '✓' : '—'}</td>
                    <td className="px-2 py-1.5">{item.voiceAssetId ? '✓' : '—'}</td>
                    <td className="px-2 py-1.5">
                      {item.missing.length === 0 ? (
                        <span className="text-xs text-emerald-700 dark:text-emerald-400">complete</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {item.missing.map((label) => (
                            <Badge key={`${item.shotId}-${label}`}>{label}</Badge>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-2 py-1.5 text-xs text-ink-mid">{item.subtitle || '—'}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </>
        )}
      </Card>

      <Card title="Export">
        <div className="flex flex-wrap gap-4">
          {EXPORT_KINDS.map((kind) => (
            <ActionButton
              key={kind}
              action={runExportAction.bind(null, slug, kind)}
              label={kind}
              variant={kind === 'project-package' ? 'primary' : 'ghost'}
              pendingLabel="Exporting…"
            />
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-line">
          <h3 className="text-sm font-semibold text-ink-hi mb-3">Compose Video (FFmpeg)</h3>
          <ComposeVideoForm slug={slug} />
        </div>
        <p className="mt-4 text-xs text-ink-lo">
          The project package freezes every bible and prompt version that was actually used, and refuses to reference an
          asset whose file is missing.
        </p>
      </Card>

      <Card title={`Export history (${exportsList.length})`}>
        {exportsList.length === 0 ? (
          <EmptyState title="Nothing exported yet" />
        ) : (
          <DataTable head={['Kind', 'When', 'Frozen versions', 'Summary', '']}>
            {exportsList.map((record) => {
              const frozen = record.frozenVersions as Record<string, string[]>;
              const frozenCount = Object.values(frozen ?? {}).reduce(
                (total, list) => total + (Array.isArray(list) ? list.length : 0),
                0,
              );
              const summary = record.summary as Record<string, unknown>;
              const isVideo = record.kind === 'video';
              const isApproved = approvedExportIds.has(record.id);
              return (
                <Fragment key={record.id}>
                <tr className="border-b border-line/60 align-top">
                  <td className="px-2 py-2">
                    <Badge>{record.kind}</Badge>
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-mid">{new Date(record.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-2 tabular-nums text-ink-mid">{frozenCount}</td>
                  <td className="px-2 py-2 text-xs text-ink-mid">
                    {isVideo ? (
                      <div className="space-y-2">
                        <p>
                          {String(summary.shots ?? 0)} shots · {String(summary.resolution ?? 'unknown')} ·{' '}
                          {String(summary.fps ?? 'unknown')} fps
                        </p>
                        <video
                          controls
                          preload="metadata"
                          src={`/api/exports/${record.id}?disposition=inline`}
                          className="aspect-video w-full max-w-md rounded-md border border-line bg-black"
                          aria-label={`Final video export from ${new Date(record.createdAt).toLocaleString()}`}
                        />
                      </div>
                    ) : (
                      <>
                        {String(summary.shots ?? 0)} shots · {String(summary.assets ?? 0)} assets ·{' '}
                        {String(summary.warnings ?? 0)} warning(s)
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <a href={`/api/exports/${record.id}`} className="text-sm text-brand hover:underline">
                      Download
                    </a>
                  </td>
                </tr>
                  {record.status === 'completed' && (
                    <tr key={`${record.id}-publish`}>
                      <td colSpan={5} className="px-2 pb-4">
                        {isApproved ? (
                          <PublishForm slug={slug} exportId={record.id} publishes={publishesList} />
                        ) : (
                          <div className="flex flex-wrap items-center gap-3">
                            <Notice tone="info">
                              Not yet approved — an operator must approve this export before it can be delivered.
                            </Notice>
                            <ActionButton
                              action={approveExportAction.bind(null, slug, record.id)}
                              label="Approve export"
                              pendingLabel="Approving…"
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </DataTable>
        )}
      </Card>

      <Card title="Status legend">
        <div className="flex flex-wrap gap-2">
          {['planned', 'prompted', 'generating', 'review', 'approved', 'rejected', 'rendered'].map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Card>
    </div>
  );
}
