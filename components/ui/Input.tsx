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
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        {...props}
        className={`w-full rounded-lg border px-3.5 py-2.5 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-600 ${error ? 'border-red-300' : 'border-zinc-300 dark:border-zinc-700'}`}
      />
      {hint && !error && (
        <p className="text-xs text-zinc-500 mt-1.5">{hint}</p>
      )}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
