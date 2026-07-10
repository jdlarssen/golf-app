import { InputHTMLAttributes, Ref } from 'react';

export function Input({
  label,
  labelHidden,
  hint,
  warning,
  error,
  id,
  inputClassName,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Keep the label for screen readers but hide it visually (e.g. inline rows). */
  labelHidden?: boolean;
  hint?: string;
  warning?: string | null;
  error?: string;
  inputClassName?: string;
  /** Forwarded to the underlying `<input>` (React 19 ref-as-prop). */
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className={
          labelHidden ? 'sr-only' : 'block text-sm font-medium text-text mb-1.5'
        }
      >
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        {...props}
        className={`w-full rounded-xl border px-3.5 py-3 bg-surface text-text placeholder-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 ${error ? 'border-danger' : 'border-border'} ${inputClassName ?? ''}`}
      />
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      {!error && warning && (
        <p className="text-xs text-warning mt-1.5">{warning}</p>
      )}
      {!error && !warning && hint && (
        <p className="text-xs text-muted mt-1.5">{hint}</p>
      )}
    </div>
  );
}
