import type { ChangeEvent, ReactNode } from 'react';
import { SelectionMark } from './ChoiceCard';

/**
 * A checkbox row with a title and a line under it (#2282): «Slipp venner
 * direkte inn» under the request card on step 5. The whole row is the native
 * checkbox's `<label>`, at least 44 px high; the box is a 22 px square drawn
 * beside the visually hidden input, and the row draws the focus ring
 * (app/globals.css, #2240).
 */
export function CheckRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-2.5 text-text has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <SelectionMark checked={checked} shape="box" />
      <span className="min-w-0">
        <span className="block font-sans text-sm font-semibold leading-[normal]">{title}</span>
        {description && (
          <span className="block font-sans text-xs leading-[1.4] text-muted">{description}</span>
        )}
      </span>
    </label>
  );
}
