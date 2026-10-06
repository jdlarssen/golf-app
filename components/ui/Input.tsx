import { InputHTMLAttributes, Ref } from 'react';
import { CARD_FIELD_CONTROL, CARD_FIELD_ERROR, CARD_FIELD_HINT, CARD_FIELD_LABEL } from './CardField';

export function Input({
  label,
  labelHidden,
  hint,
  warning,
  error,
  id,
  inputClassName,
  labelClassName,
  ref,
  variant = 'default',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Keep the label for screen readers but hide it visually (e.g. inline rows). */
  labelHidden?: boolean;
  /** Replaces the visible label's classes (the invitation form, #2266). */
  labelClassName?: string;
  hint?: string;
  warning?: string | null;
  error?: string;
  inputClassName?: string;
  /** Forwarded to the underlying `<input>` (React 19 ref-as-prop). */
  ref?: Ref<HTMLInputElement>;
  /**
   * `card`: the new-game wizard's field inside a `FormSection` card (#2426).
   * `onStrong`: a linen-outlined pill on --surface-strong, the e-mail field in
   * the friends page's green card (#2267).
   */
  variant?: 'default' | 'card' | 'onStrong';
}) {
  // Only one message shows at a time (error > warning > hint); the input points
  // at it so screen readers read it along with the label.
  const message = error || warning || hint;
  const descId = id && message ? `${id}-desc` : undefined;
  const card = variant === 'card';
  const hintClass = card ? CARD_FIELD_HINT : 'text-xs text-muted mt-1.5';
  const errorClass = card ? CARD_FIELD_ERROR : 'text-xs text-danger mt-1.5';
  return (
    <div>
      <label
        htmlFor={id}
        className={
          labelHidden
            ? 'sr-only'
            : (labelClassName ??
              (card ? CARD_FIELD_LABEL : 'block text-sm font-medium text-text mb-1.5'))
        }
      >
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        aria-describedby={descId}
        aria-invalid={!!error || undefined}
        {...props}
        // Fokusringen kommer fra den globale `:focus-visible`-regelen (#1386);
        // `focus:border-accent` blir stående som supplerende fargeskift.
        className={
          variant === 'onStrong'
            ? `w-full h-12 rounded-full border border-on-strong/50 bg-transparent px-4 text-on-strong placeholder:text-on-strong/70 ${inputClassName ?? ''}`
            : card
            ? `${CARD_FIELD_CONTROL} text-text ${error ? 'border-danger' : 'border-field-border'} ${inputClassName ?? ''}`
            : `w-full rounded-xl border px-3.5 py-3 bg-surface text-text placeholder-muted/70 focus:border-accent transition-[border-color,box-shadow] duration-150 ${error ? 'border-danger' : 'border-border'} ${inputClassName ?? ''}`
        }
      />
      {error && (
        <p id={descId} className={errorClass}>
          {error}
        </p>
      )}
      {!error && warning && (
        <p id={descId} className="text-xs text-warning-text mt-1.5">
          {warning}
        </p>
      )}
      {!error && !warning && hint && (
        <p id={descId} className={hintClass}>
          {hint}
        </p>
      )}
    </div>
  );
}
