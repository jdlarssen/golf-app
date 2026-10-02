import type { ReactNode } from 'react';

/**
 * A native radio drawn as a 44 px pill (#2282): the 0 / 1 / 2 winner counts in
 * the side-tournament card. Chosen = a forest fill with the on-colour; not
 * chosen = the card hairline on --surface. The input is visually hidden and
 * keeps its `name`, so a form that posts it reads it straight from FormData;
 * the pill is its label and draws the focus ring (app/globals.css, #2240).
 */
export function PillRadio({
  name,
  value,
  checked,
  onChange,
  disabled = false,
  children,
}: {
  /** Left out when a hidden mirror carries the value instead. */
  name?: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`inline-flex h-11 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-3.5 font-sans text-sm font-semibold tabular-nums transition-colors duration-150 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
        checked
          ? 'bg-primary text-white dark:text-bg'
          : 'border border-border bg-surface text-text hover:bg-primary-soft'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      {children}
    </label>
  );
}
