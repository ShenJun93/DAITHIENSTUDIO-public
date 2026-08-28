'use client';

/**
 * Scene content editor (TASK-UI-CORE-EDITORS-001 Scene Editor slice). Calls
 * the existing, accepted scriptService.updateScene through updateSceneAction
 * — no new service method, no schema change. Exposes the scalar narrative
 * fields of sceneInputSchema (title, timeOfDay, locationId, durationSeconds,
 * status, summary, action, emotion, visualGoal, audioGoal); `dialogue`
 * (an array of structured per-line objects) and `characters` (a bible
 * reference array) are contract-authorized but deliberately not exposed
 * here, mirroring the Character/Location Create precedent of deferring
 * structured/array fields to a later slice rather than fabricating a
 * multi-entry editor for them now. `number`, `code`, `id` and `episodeId`
 * are never rendered as inputs — they are read-only, shown only in the
 * page header/context, exactly as updateScene itself enforces server-side.
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import type { SceneRecord } from '@/application/records';
import { SCENE_STATUSES, TIME_OF_DAY } from '@/domain/enums';
import { Field, Notice, inputClass } from '@/components/ui';
import { FormSection } from '@/components/ui/formSection';
import { FieldError, ValidationSummary } from '@/components/ui/validationSummary';
import { SaveBar } from '@/components/ui/saveBar';
import { StatusSelect } from '@/components/ui/statusSelect';
import { useDirtyStateGuard } from '@/components/ui/useDirtyStateGuard';

export function SceneEditForm({
  slug,
  scene,
  locations,
  updateAction,
}: {
  slug: string;
  scene: SceneRecord;
  locations: { id: string; name: string }[];
  updateAction: (form: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const { markDirty, markClean, confirmDiscard } = useDirtyStateGuard();

  const listHref = `/projects/${slug}/scenes`;
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
    router.push(listHref);
  }

  return (
    <form onChange={markDirty} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-label="Edit scene">
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
        <Field label="Title">
          <input
            id="field-title"
            name="title"
            required
            maxLength={200}
            defaultValue={scene.title}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? 'field-title-error' : undefined}
          />
        </Field>
        <FieldError id="field-title-error" message={fieldErrors.title} />
      </div>

      <div>
        <Field label="Time of day">
          <StatusSelect
            id="field-timeOfDay"
            name="timeOfDay"
            defaultValue={scene.timeOfDay}
            options={TIME_OF_DAY}
            ariaInvalid={Boolean(fieldErrors.timeOfDay)}
            ariaDescribedBy={fieldErrors.timeOfDay ? 'field-timeOfDay-error' : undefined}
          />
        </Field>
        <FieldError id="field-timeOfDay-error" message={fieldErrors.timeOfDay} />
      </div>

      <div>
        <Field label="Location" hint="Where this scene takes place.">
          <select
            id="field-locationId"
            name="locationId"
            defaultValue={scene.locationId ?? ''}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.locationId)}
            aria-describedby={fieldErrors.locationId ? 'field-locationId-error' : undefined}
          >
            <option value="">— No location assigned —</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </Field>
        <FieldError id="field-locationId-error" message={fieldErrors.locationId} />
      </div>

      <div>
        <Field label="Duration (seconds)">
          <input
            id="field-durationSeconds"
            name="durationSeconds"
            type="number"
            min={0}
            max={7200}
            defaultValue={scene.durationSeconds}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.durationSeconds)}
            aria-describedby={fieldErrors.durationSeconds ? 'field-durationSeconds-error' : undefined}
          />
        </Field>
        <FieldError id="field-durationSeconds-error" message={fieldErrors.durationSeconds} />
      </div>

      <div>
        <Field label="Status">
          <StatusSelect
            id="field-status"
            name="status"
            defaultValue={scene.status}
            options={SCENE_STATUSES}
            ariaInvalid={Boolean(fieldErrors.status)}
            ariaDescribedBy={fieldErrors.status ? 'field-status-error' : undefined}
          />
        </Field>
        <FieldError id="field-status-error" message={fieldErrors.status} />
      </div>

      <FormSection title="Story" hint="What happens in this scene, used when compiling prompts.">
        <div className="sm:col-span-2">
          <Field label="Summary">
            <textarea
              id="field-summary"
              name="summary"
              rows={3}
              maxLength={4000}
              defaultValue={scene.summary}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.summary)}
              aria-describedby={fieldErrors.summary ? 'field-summary-error' : undefined}
            />
          </Field>
          <FieldError id="field-summary-error" message={fieldErrors.summary} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Scene content" hint="The full action/description of what happens.">
            <textarea
              id="field-action"
              name="action"
              rows={5}
              maxLength={20_000}
              defaultValue={scene.action}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.action)}
              aria-describedby={fieldErrors.action ? 'field-action-error' : undefined}
            />
          </Field>
          <FieldError id="field-action-error" message={fieldErrors.action} />
        </div>
        <div>
          <Field label="Emotion" hint="The dominant emotional tone of this scene.">
            <input
              id="field-emotion"
              name="emotion"
              maxLength={200}
              defaultValue={scene.emotion}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.emotion)}
              aria-describedby={fieldErrors.emotion ? 'field-emotion-error' : undefined}
            />
          </Field>
          <FieldError id="field-emotion-error" message={fieldErrors.emotion} />
        </div>
      </FormSection>

      <FormSection title="Production goals" hint="Optional creative direction for image/video generation.">
        <div>
          <Field label="Visual goal">
            <textarea
              id="field-visualGoal"
              name="visualGoal"
              rows={2}
              maxLength={1000}
              defaultValue={scene.visualGoal}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.visualGoal)}
              aria-describedby={fieldErrors.visualGoal ? 'field-visualGoal-error' : undefined}
            />
          </Field>
          <FieldError id="field-visualGoal-error" message={fieldErrors.visualGoal} />
        </div>
        <div>
          <Field label="Audio goal">
            <textarea
              id="field-audioGoal"
              name="audioGoal"
              rows={2}
              maxLength={1000}
              defaultValue={scene.audioGoal}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.audioGoal)}
              aria-describedby={fieldErrors.audioGoal ? 'field-audioGoal-error' : undefined}
            />
          </Field>
          <FieldError id="field-audioGoal-error" message={fieldErrors.audioGoal} />
        </div>
      </FormSection>

      <div className="sm:col-span-2">
        <SaveBar
          pending={pending}
          idleLabel="Save scene"
          savingLabel="Saving…"
          onCancel={cancel}
          status={result?.ok ? result.message : undefined}
        />
      </div>
    </form>
  );
}
