import { InputHTMLAttributes } from 'react';

export function Input({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-text mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        {...props}
        className={`w-full rounded-xl border px-3.5 py-3 bg-surface text-text placeholder-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 ${error ? 'border-danger' : 'border-border'}`}
      />
      {hint && !error && (
        <p className="text-xs text-muted mt-1.5">{hint}</p>
      )}
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
    </div>
  );
}
