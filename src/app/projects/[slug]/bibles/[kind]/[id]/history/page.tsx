import { notFound } from 'next/navigation';
import { getStudio } from '@/infrastructure/container';
import { createProjectService } from '@/application/services/projectService';
import { createBibleService } from '@/application/services/bibleService';
import { Card, EmptyState, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function BibleHistoryPage({
  params,
}: {
  params: Promise<{ slug: string; kind: string; id: string }>;
}) {
  const { slug, kind, id } = await params;
  if (!['character', 'location', 'prop', 'style'].includes(kind)) {
    notFound();
  }

  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const bibleService = createBibleService(studio);

  let title = 'Bible History';
  let code = '';
  switch (kind) {
    case 'character': {
      const c = await studio.bibles.characterById(id);
      if (!c) notFound();
      title = `History for ${c.name}`;
      code = c.code;
      break;
    }
    case 'location': {
      const c = await studio.bibles.locationById(id);
      if (!c) notFound();
      title = `History for ${c.name}`;
      code = c.code;
      break;
    }
    case 'prop': {
      const c = await studio.bibles.propById(id);
      if (!c) notFound();
      title = `History for ${c.name}`;
      code = c.code;
      break;
    }
    case 'style': {
      const c = await studio.bibles.styleById(id);
      if (!c) notFound();
      title = `History for ${c.name}`;
      code = c.code;
      break;
    }
  }

  const history = await bibleService.versionHistoryWithUsage(kind, id);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <a href={`/projects/${slug}/bibles`} className="text-sm text-blue-500 hover:underline">
          &larr; Back to Bibles
        </a>
        <h1 className="text-xl font-bold text-ink-hi">{title}</h1>
        <span className="font-mono text-sm text-ink-lo">{code}</span>
      </div>

      <Card>
        {history.length === 0 ? (
          <EmptyState title="No history found" />
        ) : (
          <table className="w-full text-left text-sm text-ink-mid">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-medium text-ink-lo">Version</th>
                <th className="py-2 pr-4 font-medium text-ink-lo">Created At</th>
                <th className="py-2 pr-4 font-medium text-ink-lo">Note</th>
                <th className="py-2 pr-4 font-medium text-ink-lo">Usage</th>
                <th className="py-2 font-medium text-ink-lo">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.map((v) => (
                <tr key={v.version}>
                  <td className="py-3 pr-4 font-mono font-medium text-ink-hi">V{v.version}</td>
                  <td className="py-3 pr-4">{new Date(v.createdAt).toLocaleString()}</td>
                  <td className="py-3 pr-4">{v.note}</td>
                  <td className="py-3 pr-4">
                    {v.promptsCount === 0 ? (
                      <span className="text-ink-lo">Unused</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Pinned by {v.promptsCount} prompt{v.promptsCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    <details className="text-xs group">
                      <summary className="cursor-pointer text-blue-500 hover:underline">View Snapshot</summary>
                      <pre className="mt-2 overflow-auto rounded bg-ink-lo/5 p-2 font-mono text-[10px] text-ink-mid">
                        {JSON.stringify(v.payload, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
