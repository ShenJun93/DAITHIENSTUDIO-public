/** Provider capability matrix — checked at runtime, never assumed. */
import { getStudio } from '@/infrastructure/container';
import { GENERATION_KINDS } from '@/domain/enums';
import { knownProviders, rateFor } from '@/domain/cost';
import { Badge, Breadcrumbs, Card, DataTable } from '@/components/ui';
import { ComfyUiStatus } from '@/components/ComfyUiStatus';

export const dynamic = 'force-dynamic';

const CAPABILITIES = [
  'structuredText',
  'textToImage',
  'imageToImage',
  'referenceImages',
  'textToVideo',
  'imageToVideo',
  'firstLastFrame',
  'extendVideo',
  'lipSync',
  'voice',
  'music',
] as const;

export default function ProvidersPage() {
  const studio = getStudio();
  const descriptors = studio.providers.descriptors();

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: 'Studio', href: '/' }, { label: 'Providers' }]} />
      <h1 className="text-xl font-semibold text-ink-hi">Providers</h1>

      <Card title="Configured providers">
        <ul className="space-y-2">
          {descriptors.map((descriptor) => (
            <li key={descriptor.key} className="flex flex-wrap items-center gap-2 rounded border border-line p-2">
              <span className="text-sm font-medium text-ink-hi">{descriptor.label}</span>
              <Badge>{descriptor.key}</Badge>
              {descriptor.offline && <Badge>offline · free</Badge>}
              <span className="text-xs text-ink-lo">max video {descriptor.capabilities.maxVideoSeconds}s</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-lo">
          Set <code>GOOGLE_API_KEY</code> in <code>.env</code> to register the Google adapters. A missing key is never
          silently downgraded — the registry refuses so you always know what rendered a frame.
        </p>
      </Card>

      <ComfyUiStatus />

      <Card title="Capability matrix">
        <DataTable head={['Capability', ...descriptors.map((descriptor) => descriptor.key)]}>
          {CAPABILITIES.map((capability) => (
            <tr key={capability} className="border-b border-line/60">
              <td className="px-2 py-1.5 text-ink-mid">{capability}</td>
              {descriptors.map((descriptor) => (
                <td key={`${capability}-${descriptor.key}`} className="px-2 py-1.5">
                  {descriptor.capabilities[capability] ? (
                    <span className="text-emerald-700 dark:text-emerald-400">✓ yes</span>
                  ) : (
                    <span className="text-ink-lo">✕ no</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </DataTable>
      </Card>

      <Card title="Defaults and cost">
        <DataTable head={['Kind', 'Default provider', 'Default model', 'Rate']}>
          {GENERATION_KINDS.map((kind) => {
            const key = studio.providers.defaultKeyFor(kind);
            const rate = rateFor(key, kind);
            return (
              <tr key={kind} className="border-b border-line/60">
                <td className="px-2 py-1.5 text-ink-hi">{kind}</td>
                <td className="px-2 py-1.5">
                  <Badge>{key}</Badge>
                </td>
                <td className="px-2 py-1.5 font-mono text-xs text-ink-mid">
                  {studio.providers.defaultModelFor(kind, key)}
                </td>
                <td className="px-2 py-1.5 text-xs text-ink-mid">
                  {rate ? `$${rate.perUnitUsd} per ${rate.unit}` : '—'}
                </td>
              </tr>
            );
          })}
        </DataTable>
        <p className="mt-2 text-xs text-ink-lo">Known cost tables: {knownProviders().join(', ')}.</p>
      </Card>
    </div>
  );
}
