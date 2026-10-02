import { Children, isValidElement, type ReactNode, type SelectHTMLAttributes } from 'react';

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

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'size'> & {
  label: ReactNode;
  /** Binds the label to the select. */
  id: string;
  hint?: ReactNode;
  /**
   * `default`: the 50 px field. `compact` (#2321): the 44 px flight picker —
   * radius 10, 14 px text, 10 px inset. `slot`: the same field on a team or
   * side card, 46 px as the artboard renders it (its 44 px box draws the
   * border outside).
   */
  size?: 'default' | 'compact' | 'slot';
  /** Keep the label for screen readers only (the slots on a team card). */
  labelHidden?: boolean;
  /** Classes on the outer wrapper, e.g. a min width for the flight picker. */
  wrapperClassName?: string;
};

const COMPACT_CONTROL =
  'w-full rounded-[10px] border bg-surface px-2.5 font-sans text-sm transition-[border-color,box-shadow] duration-150';

/** The text of the `<option>` whose value is `value`, for the drawn label. */
function optionLabel(children: ReactNode, value: SelectProps['value']): ReactNode {
  let label: ReactNode = null;
  Children.forEach(children, (child) => {
    if (label !== null || !isValidElement<{ value?: unknown; children?: ReactNode }>(child)) return;
    if (String(child.props.value ?? '') === String(value ?? '')) label = child.props.children;
  });
  return label;
}

/**
 * A native `<select>` drawn as the artboards' field: the chevron is ours (the
 * native arrow is hidden), and the empty option reads muted like a placeholder.
 *
 * #2321: in `compact` and `slot` the chosen option is drawn in a span that ends
 * in «…» 6 px before the chevron, as the artboards' slot does; a native select
 * cannot ellipsize, it cuts a name mid-letter. The select keeps the input,
 * focus and its accessible name; only its own text is transparent. The flight
 * picker (`compact`) has a text-coloured chevron, the team slots a muted one.
 */
export function CardSelect({
  label,
  id,
  hint,
  value,
  size = 'default',
  labelHidden = false,
  wrapperClassName = '',
  ...rest
}: SelectProps) {
  const empty = value === '' || value === undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const compact = size !== 'default';
  const drawnLabel = compact ? optionLabel(rest.children, value) : null;
  return (
    <div className={wrapperClassName}>
      <label htmlFor={id} className={labelHidden ? 'sr-only' : CARD_FIELD_LABEL}>
        {label}
      </label>
      <div className="relative">
        {compact && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-[11px] right-[33px] flex items-center font-sans text-sm leading-[normal] ${empty ? 'text-muted' : 'text-text'}`}
          >
            <span className="min-w-0 truncate">{drawnLabel}</span>
          </span>
        )}
        <select
          {...rest}
          id={id}
          value={value}
          aria-describedby={hintId}
          className={`${compact ? `${COMPACT_CONTROL} ${size === 'slot' ? 'h-[46px]' : 'h-11'} pr-8` : `${CARD_FIELD_CONTROL} pr-[38px]`} appearance-none border-field-border disabled:cursor-not-allowed [&>option]:text-text ${compact ? 'text-transparent' : empty ? 'text-muted' : 'text-text'}`}
        />
        {/* 14 px (compact: 10 px) inside the 1 px outline, as on the artboards. */}
        <span
          className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 ${size === 'compact' ? 'text-text' : 'text-muted'} ${compact ? 'right-[11px]' : 'right-[15px]'}`}
        >
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
