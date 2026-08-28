/**
 * VC2 — Shot visual specification summary (TASK-UI-VISUAL-CONTROL-001).
 * Renders the VC1 read model's `ShotVisualSpecification` fields for the shot.
 */
import type { ShotVisualSpecification } from '@/domain/visualControl/types';
import { Card } from '@/components/ui';

const FIELDS: Array<{
  key: 'shotSize' | 'cameraAngle' | 'cameraMovement' | 'lens' | 'lighting' | 'importance';
  label: string;
}> = [
  { key: 'shotSize', label: 'Shot size' },
  { key: 'cameraAngle', label: 'Camera angle' },
  { key: 'cameraMovement', label: 'Camera movement' },
  { key: 'lens', label: 'Lens' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'importance', label: 'Importance' },
];

export function VisualSpecSummary({ spec }: { spec: ShotVisualSpecification }) {
  return (
    <Card title="Shot visual specification">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {FIELDS.map(({ key, label }) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-ink-lo">{label}</dt>
            <dd className="text-ink-hi">{displayValue(spec, key)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-lo">Duration</dt>
          <dd className="text-ink-hi">{spec.durationSeconds}s</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-lo">Emotion</dt>
          <dd className="text-ink-hi">{spec.emotion || '—'}</dd>
        </div>
      </dl>
      {spec.dialogue && (
        <p className="mt-2 border-l-2 border-brand pl-3 text-sm italic text-ink-hi">“{spec.dialogue}”</p>
      )}
      {spec.intentionalChanges.length > 0 && (
        <p className="mt-2 text-xs text-ink-mid">Intentional changes: {spec.intentionalChanges.join(', ')}</p>
      )}
    </Card>
  );
}

function displayValue(spec: ShotVisualSpecification, key: (typeof FIELDS)[number]['key']): string {
  if (key === 'cameraMovement') {
    return `${spec.cameraMovement.speed} ${spec.cameraMovement.type}`;
  }
  if (key === 'importance') {
    return spec.importance === 'key' ? 'Key shot' : 'Normal shot';
  }
  return spec[key];
}
