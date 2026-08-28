'use client';

/**
 * Shot content editor (TASK-UI-CORE-EDITORS-001 Shot Editor slice). Calls the
 * existing, accepted scriptService.updateShot through updateShotAction — no
 * new service method, no schema change. Exposes the content-field subset of
 * shotContentUpdateSchema (title, description, shotSize, cameraAngle,
 * cameraMovement.{type,speed}, lens, durationSeconds, dialogue, emotion,
 * lighting, aspectRatio, importance). `visualEffects`/`soundEffects` are
 * contract-authorized string arrays but deliberately not exposed here,
 * mirroring the Character/Location Create and Scene Editor precedent of
 * deferring array/structured fields rather than fabricating a tag editor for
 * them now. `status`, the pinned character/location/prop bible-snapshot
 * references and `shotNumber` are never rendered as inputs at all — they are
 * excluded at the service boundary and shown read-only, in the page
 * header/context/inspector only.
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import type { ShotRecord } from '@/application/records';
import { ASPECT_RATIOS, CAMERA_ANGLES, CAMERA_MOVEMENT_TYPES, MOVEMENT_SPEEDS, SHOT_SIZES } from '@/domain/enums';
import { Field, Notice, inputClass } from '@/components/ui';
import { FormSection } from '@/components/ui/formSection';
import { FieldError, ValidationSummary } from '@/components/ui/validationSummary';
import { SaveBar } from '@/components/ui/saveBar';
import { StatusSelect } from '@/components/ui/statusSelect';
import { useDirtyStateGuard } from '@/components/ui/useDirtyStateGuard';

/** Mirrors the literal `z.enum(['normal', 'key'])` in shotInputSchema (src/domain/schemas.ts). */
const IMPORTANCE_OPTIONS = ['normal', 'key'] as const;

export function ShotEditForm({
  slug,
  shot,
  cancelHref,
  updateAction,
}: {
  slug: string;
  shot: ShotRecord;
  cancelHref: string;
  updateAction: (form: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const { markDirty, markClean, confirmDiscard } = useDirtyStateGuard();

  const fieldErrors = result?.fieldErrors ?? {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await updateAction(form);
      setResult(outcome);
      if (outcome.ok) {
        markClean();
        router.refresh();
      }
    });
  }

  function cancel() {
    if (!confirmDiscard()) return;
    router.push(cancelHref);
  }

  return (
    <form onChange={markDirty} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-label="Edit shot">
      <div className="sm:col-span-2">
        <ValidationSummary errors={fieldErrors} />
      </div>

      {result && !result.ok && !hasFieldErrors && (
        <div className="sm:col-span-2">
          <Notice tone="warning">
            {result.message}
            {result.code ? ` (${result.code})` : ''}
          </Notice>
        </div>
      )}

      <div className="sm:col-span-2">
        <Field label="Title" hint="Optional short label for this shot.">
          <input
            id="field-title"
            name="title"
            maxLength={200}
            defaultValue={shot.title}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? 'field-title-error' : undefined}
          />
        </Field>
        <FieldError id="field-title-error" message={fieldErrors.title} />
      </div>

      <FormSection title="Story and action" hint="What happens in this shot, used when compiling prompts.">
        <div className="sm:col-span-2">
          <Field label="Shot description">
            <textarea
              id="field-description"
              name="description"
              rows={4}
              maxLength={4000}
              defaultValue={shot.description}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? 'field-description-error' : undefined}
            />
          </Field>
          <FieldError id="field-description-error" message={fieldErrors.description} />
        </div>
      </FormSection>

      <FormSection title="Dialogue" hint="What is said on screen during this shot, if anything.">
        <div className="sm:col-span-2">
          <Field label="Dialogue">
            <textarea
              id="field-dialogue"
              name="dialogue"
              rows={3}
              maxLength={4000}
              defaultValue={shot.dialogue}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.dialogue)}
              aria-describedby={fieldErrors.dialogue ? 'field-dialogue-error' : undefined}
            />
          </Field>
          <FieldError id="field-dialogue-error" message={fieldErrors.dialogue} />
        </div>
      </FormSection>

      <FormSection title="Camera and composition" hint="How this shot is framed and moves.">
        <div>
          <Field label="Shot size">
            <StatusSelect
              id="field-shotSize"
              name="shotSize"
              defaultValue={shot.shotSize}
              options={SHOT_SIZES}
              ariaInvalid={Boolean(fieldErrors.shotSize)}
              ariaDescribedBy={fieldErrors.shotSize ? 'field-shotSize-error' : undefined}
            />
          </Field>
          <FieldError id="field-shotSize-error" message={fieldErrors.shotSize} />
        </div>
        <div>
          <Field label="Camera angle">
            <StatusSelect
              id="field-cameraAngle"
              name="cameraAngle"
              defaultValue={shot.cameraAngle}
              options={CAMERA_ANGLES}
              ariaInvalid={Boolean(fieldErrors.cameraAngle)}
              ariaDescribedBy={fieldErrors.cameraAngle ? 'field-cameraAngle-error' : undefined}
            />
          </Field>
          <FieldError id="field-cameraAngle-error" message={fieldErrors.cameraAngle} />
        </div>
        <div>
          <Field label="Camera movement">
            <StatusSelect
              id="field-cameraMovement.type"
              name="cameraMovementType"
              defaultValue={shot.cameraMovement.type}
              options={CAMERA_MOVEMENT_TYPES}
              ariaInvalid={Boolean(fieldErrors['cameraMovement.type'])}
              ariaDescribedBy={fieldErrors['cameraMovement.type'] ? 'field-cameraMovement.type-error' : undefined}
            />
          </Field>
          <FieldError id="field-cameraMovement.type-error" message={fieldErrors['cameraMovement.type']} />
        </div>
        <div>
          <Field label="Movement speed">
            <StatusSelect
              id="field-cameraMovement.speed"
              name="cameraMovementSpeed"
              defaultValue={shot.cameraMovement.speed}
              options={MOVEMENT_SPEEDS}
              ariaInvalid={Boolean(fieldErrors['cameraMovement.speed'])}
              ariaDescribedBy={fieldErrors['cameraMovement.speed'] ? 'field-cameraMovement.speed-error' : undefined}
            />
          </Field>
          <FieldError id="field-cameraMovement.speed-error" message={fieldErrors['cameraMovement.speed']} />
        </div>
        <div>
          <Field label="Lens">
            <input
              id="field-lens"
              name="lens"
              maxLength={40}
              defaultValue={shot.lens}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.lens)}
              aria-describedby={fieldErrors.lens ? 'field-lens-error' : undefined}
            />
          </Field>
          <FieldError id="field-lens-error" message={fieldErrors.lens} />
        </div>
        <div>
          <Field label="Aspect ratio">
            <StatusSelect
              id="field-aspectRatio"
              name="aspectRatio"
              defaultValue={shot.aspectRatio}
              options={ASPECT_RATIOS}
              ariaInvalid={Boolean(fieldErrors.aspectRatio)}
              ariaDescribedBy={fieldErrors.aspectRatio ? 'field-aspectRatio-error' : undefined}
            />
          </Field>
          <FieldError id="field-aspectRatio-error" message={fieldErrors.aspectRatio} />
        </div>
      </FormSection>

      <FormSection title="Timing" hint="How long this shot runs.">
        <div>
          <Field label="Duration (seconds)">
            <input
              id="field-durationSeconds"
              name="durationSeconds"
              type="number"
              min={1}
              max={600}
              defaultValue={shot.durationSeconds}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.durationSeconds)}
              aria-describedby={fieldErrors.durationSeconds ? 'field-durationSeconds-error' : undefined}
            />
          </Field>
          <FieldError id="field-durationSeconds-error" message={fieldErrors.durationSeconds} />
        </div>
      </FormSection>

      <FormSection title="Prompt intent" hint="Creative direction that feeds image/video prompt compilation.">
        <div>
          <Field label="Emotion" hint="The dominant emotional tone of this shot.">
            <input
              id="field-emotion"
              name="emotion"
              maxLength={200}
              defaultValue={shot.emotion}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.emotion)}
              aria-describedby={fieldErrors.emotion ? 'field-emotion-error' : undefined}
            />
          </Field>
          <FieldError id="field-emotion-error" message={fieldErrors.emotion} />
        </div>
        <div>
          <Field label="Lighting">
            <input
              id="field-lighting"
              name="lighting"
              maxLength={400}
              defaultValue={shot.lighting}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.lighting)}
              aria-describedby={fieldErrors.lighting ? 'field-lighting-error' : undefined}
            />
          </Field>
          <FieldError id="field-lighting-error" message={fieldErrors.lighting} />
        </div>
        <div>
          <Field label="Priority" hint="A key shot gets extra planner attention; normal is the default.">
            <StatusSelect
              id="field-importance"
              name="importance"
              defaultValue={shot.importance}
              options={IMPORTANCE_OPTIONS}
              ariaInvalid={Boolean(fieldErrors.importance)}
              ariaDescribedBy={fieldErrors.importance ? 'field-importance-error' : undefined}
            />
          </Field>
          <FieldError id="field-importance-error" message={fieldErrors.importance} />
        </div>
      </FormSection>

      <div className="sm:col-span-2">
        <SaveBar
          pending={pending}
          idleLabel="Save shot"
          savingLabel="Saving…"
          onCancel={cancel}
          status={result?.ok ? result.message : undefined}
        />
      </div>
    </form>
  );
}
