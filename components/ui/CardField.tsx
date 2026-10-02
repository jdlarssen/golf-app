import type { ReactNode, SelectHTMLAttributes } from 'react';

/**
 * Text fields inside a `FormSection` card (#2426): the new-game artboards'
 * 50 px field with the darker field outline, a 13 px / 600 label 6 px above
 * and a 12 px hint 6 px below. `Input variant="card"` and `CardSelect` both
 * read these, so the field look has one home. The text colour is left to the
 * caller: a select reads muted while its empty option is chosen. So is the
 * outline colour, which an input in error swaps for --danger.
 */
export const CARD_FIELD_LABEL = 'block mb-1.5 font-sans text-[13px] font-semibold leading-[normal] text-text';
export const CARD_FIELD_CONTROL =
  'h-[50px] w-full rounded-xl border bg-surface px-3.5 font-sans text-base placeholder:text-muted transition-[border-color,box-shadow] duration-150';
export const CARD_FIELD_HINT = 'mt-1.5 font-sans text-xs leading-[1.4] text-muted';
export const CARD_FIELD_ERROR = 'mt-1.5 font-sans text-xs leading-[1.4] text-danger';

function Chevron() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  label: ReactNode;
  /** Binds the label to the select. */
  id: string;
  hint?: ReactNode;
};

/**
 * A native `<select>` drawn as the artboards' field: the chevron is ours (the
 * native arrow is hidden), and the empty option reads muted like a placeholder.
 */
export function CardSelect({ label, id, hint, value, ...rest }: SelectProps) {
  const empty = value === '' || value === undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className={CARD_FIELD_LABEL}>
        {label}
      </label>
      <div className="relative">
        <select
          {...rest}
          id={id}
          value={value}
          aria-describedby={hintId}
          className={`${CARD_FIELD_CONTROL} appearance-none border-field-border pr-[38px] disabled:cursor-not-allowed [&>option]:text-text ${empty ? 'text-muted' : 'text-text'}`}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 flex -translate-y-1/2 text-muted">
          <Chevron />
        </span>
      </div>
      {hint && (
        <p id={hintId} className={CARD_FIELD_HINT}>
          {hint}
        </p>
      )}
    </div>
  );
}
