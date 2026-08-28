import { inputClass } from '@/components/ui';

/**
 * Shared status `<select>`, parameterized by the entity's own real status
 * enum. Replaces the hand-rolled `<select>` with a literal
 * `draft/approved/locked` option list duplicated across CharacterBibleForm,
 * LocationBibleForm, PropBibleForm and StyleBibleForm.
 */
export function StatusSelect({
  id,
  name,
  defaultValue,
  options,
  labels,
  className = inputClass,
  ariaInvalid,
  ariaDescribedBy,
}: {
  id?: string;
  name: string;
  defaultValue: string;
  options: readonly string[];
  /** Optional display text per value, for enums whose raw value (e.g. "in-production") isn't the label a non-technical operator should read (e.g. "In production"). Falls back to the raw value when omitted, unchanged for every existing caller. */
  labels?: Record<string, string>;
  className?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className={className}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
    >
      {options.map((value) => (
        <option key={value} value={value}>
          {labels?.[value] ?? value}
        </option>
      ))}
    </select>
  );
}
