/** Script module — the editor plus what the parser produced. */
import { getStudio } from '@/infrastructure/container';
import { createScriptService } from '@/application/services/scriptService';
import { createProjectService } from '@/application/services/projectService';
import { parseScriptAction, saveScriptAction, buildShotsAction } from '@/app/actions';
import { ScriptEditor } from '@/components/ScriptEditor';
import { ActionButton } from '@/components/ActionButton';
import { Card, DataTable, EmptyState, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ScriptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await createProjectService(studio).get(slug);
  const script = await createScriptService(studio).getScript(slug);
  const scenes = await studio.scenes.listByProject(project.id);

  return (
    <div className="space-y-5">
      <Card
        title={`Script ${script ? `· v${script.version}` : ''}`}
        action={script ? <StatusBadge status={script.status} /> : null}
      >
        <ScriptEditor
          initialRaw={script?.raw ?? ''}
          savedAt={script?.updatedAt ?? null}
          hasScenes={scenes.length > 0}
          saveAction={saveScriptAction.bind(null, slug)}
          parseAction={parseScriptAction.bind(null, slug)}
        />
      </Card>

      <Card
        title={`Parsed scenes (${scenes.length})`}
        action={<ActionButton action={buildShotsAction.bind(null, slug)} label="Build shots" variant="ghost" />}
      >
        {scenes.length === 0 ? (
          <EmptyState title="Nothing parsed yet" hint="Save the script, then parse it. Parsing is deterministic and free." />
        ) : (
          <DataTable head={['Code', 'Title', 'Location', 'Time', 'Lines', 'Est.']}>
            {scenes.map((scene) => (
              <tr key={scene.id} className="border-b border-line/60">
                <td className="px-2 py-2 font-mono text-xs text-ink-lo">{scene.code}</td>
                <td className="px-2 py-2 text-ink-hi">{scene.title}</td>
                <td className="px-2 py-2 font-mono text-xs text-ink-lo">{scene.locationId?.slice(0, 10) ?? '—'}</td>
                <td className="px-2 py-2 text-ink-mid">{scene.timeOfDay}</td>
                <td className="px-2 py-2 tabular-nums text-ink-mid">{scene.dialogue.length}</td>
                <td className="px-2 py-2 tabular-nums text-ink-mid">{scene.durationSeconds}s</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
