'use client';

import { useState, useTransition } from 'react';
import type { ProductionType } from '@/domain/enums';
import { PRODUCTION_TYPES } from '@/domain/enums';
import { Button, Card, Field, inputClass } from './ui';

interface Props {
  slug: string;
  currentType: ProductionType | null;
  changeAction: (slug: string, input: { productionType: ProductionType | null; confirmExistingProductionData?: boolean }) => Promise<{ ok: boolean; status?: string; evidence?: readonly string[] }>;
}

export function ProjectProductionTypeControl({ slug, currentType, changeAction }: Props) {
  const [pending, startTransition] = useTransition();
  const [targetType, setTargetType] = useState<ProductionType | null>(currentType);
  const [confirmationEvidence, setConfirmationEvidence] = useState<readonly string[] | null>(null);

  const handleSubmit = (confirm: boolean = false) => {
    startTransition(async () => {
      const res = await changeAction(slug, {
        productionType: targetType,
        confirmExistingProductionData: confirm,
      });

      if (res.ok && res.status === 'CONFIRMATION_REQUIRED') {
        setConfirmationEvidence(res.evidence || []);
      } else if (res.ok && res.status === 'UPDATED') {
        setConfirmationEvidence(null);
        // Resets automatically via revalidatePath
      }
    });
  };

  if (confirmationEvidence !== null) {
    return (
      <Card title="Confirm Production Type Change">
        <div className="space-y-4">
          <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded border border-amber-200">
            WARNING: Changing the production type will affect the following existing production data:
            <ul className="mt-2 list-disc list-inside">
              {confirmationEvidence.map(e => <li key={e}>{e}</li>)}
            </ul>
          </p>
          <div className="flex gap-3">
            <Button onClick={() => handleSubmit(true)} disabled={pending} variant="danger">
              {pending ? 'Confirming…' : 'Confirm change'}
            </Button>
            <Button onClick={() => setConfirmationEvidence(null)} disabled={pending} variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Production Type">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Current Type">
            <select
              value={targetType ?? ''}
              onChange={(e) => setTargetType((e.target.value || null) as ProductionType | null)}
              className={inputClass}
              disabled={pending}
            >
              <option value="">Not selected</option>
              {PRODUCTION_TYPES.map((t: string) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <Button 
          onClick={() => handleSubmit(false)} 
          disabled={pending || targetType === currentType}
        >
          {pending ? 'Saving…' : 'Change'}
        </Button>
      </div>
    </Card>
  );
}
