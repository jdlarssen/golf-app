import type { ReactNode } from 'react';

/**
 * The new-game wizard's choice card (#2426): a pickable card with a Fraunces
 * title and an optional muted line, as «Velg lagstørrelse» and every
 * netto/brutto or variant picker on step 2 draw it. Chosen = a 2 px forest
 * frame on the pale green fill; not chosen = the 1 px card hairline on white.
 *
 * Two controls wear it, and each keeps its own role:
 * - `RadioChoiceCard`: a visually hidden native radio inside the card's label
 *   (the setup sections, whose radios post straight into the form).
 * - `choiceCardClass` + `ChoiceCardText` on a `<button role="radio">` (the
 *   team size tiles, with the shared roving focus).
 *
 * `RadioOptionCard` is the larger sibling on step 5 (#2282): a selection
 * circle, a title with a pill beside it, and a description under it — the
 * «Hvem kan melde seg på?» cards.
 */

/** `centered`: the shamble count's 1/2/3. `dense`: three tiles a row (Texas team size). */
export type ChoiceCardLayout = 'start' | 'centered' | 'dense';

/**
 * Min heights the artboards draw. The card grows past it when the title wraps.
 * Classes are spelled out so Tailwind sees them.
 */
const MIN_HEIGHT = {
  52: 'min-h-[52px]',
  60: 'min-h-[60px]',
  64: 'min-h-[64px]',
  72: 'min-h-[72px]',
} as const;
export type ChoiceCardHeight = keyof typeof MIN_HEIGHT;

/**
 * Chosen vs not chosen, shared with the arrangement tiles on step 1, which
 * have their own shape but the same states.
 */
export function choiceStateClass(selected: boolean): string {
  return selected
    ? 'border-2 border-primary bg-primary-soft'
    : 'border border-border bg-surface hover:bg-primary-soft/60';
}

export function choiceCardClass(
  selected: boolean,
  { height = 60, layout = 'start' }: { height?: ChoiceCardHeight; layout?: ChoiceCardLayout } = {},
): string {
  const align =
    layout === 'centered' ? 'items-center text-center px-3' : layout === 'dense' ? 'items-start text-left px-2.5' : 'items-start text-left px-3';
  return `relative flex ${MIN_HEIGHT[height]} cursor-pointer flex-col justify-center rounded-[14px] py-2.5 text-text transition-colors duration-150 ${align} ${choiceStateClass(selected)}`;
}

export function ChoiceCardText({
  title,
  hint,
  layout = 'start',
}: {
  title: ReactNode;
  hint?: ReactNode;
  layout?: ChoiceCardLayout;
}) {
  return (
    <>
      <span
        className={`font-serif font-semibold leading-[normal] ${layout === 'dense' ? 'text-[15px]' : 'text-[17px]'}`}
      >
        {title}
      </span>
      {hint && (
        <span className="mt-0.5 font-sans text-xs leading-[normal] text-muted">{hint}</span>
      )}
    </>
  );
}

const GRID_COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
} as const;

/** The radiogroup the cards sit in: 8 px apart, one to three a row. */
export function ChoiceCardGrid({
  columns,
  label,
  children,
}: {
  columns: keyof typeof GRID_COLS;
  /** Names the radiogroup for screen readers. */
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${GRID_COLS[columns]}`}>
      {children}
    </div>
  );
}

export function RadioChoiceCard({
  name,
  value,
  checked,
  onChange,
  disabled = false,
  title,
  hint,
  height,
  layout,
}: {
  /**
   * Left out when the form gets the value from a hidden mirror instead
   * (`serializedExternally` in the step 5 sections), so FormData holds it once.
   */
  name?: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  title: ReactNode;
  hint?: ReactNode;
  height?: ChoiceCardHeight;
  layout?: ChoiceCardLayout;
}) {
  return (
    <label
      className={`${choiceCardClass(checked, { height, layout })} has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`}
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
      <ChoiceCardText title={title} hint={hint} layout={layout} />
    </label>
  );
}

/**
 * The 22 px selection circle: a forest disc with a tick when chosen, a ring in
 * the field outline when not. Shared by `RadioOptionCard` and `CheckRow` (which
 * squares the corners).
 */
export function SelectionMark({
  checked,
  shape = 'circle',
}: {
  checked: boolean;
  shape?: 'circle' | 'box';
}) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-md';
  return (
    <span
      aria-hidden="true"
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center text-xs leading-none ${radius} ${
        checked
          ? 'bg-primary text-white dark:text-bg'
          : 'border-[1.5px] border-field-border'
      }`}
    >
      {checked && '✓'}
    </span>
  );
}

/**
 * A choice card with room to explain itself (#2282): the selection circle on
 * the left, a Fraunces title with an optional pill beside it, and a 12 px
 * description under it. At least 64 px, 12 px × 14 px inside. A visually
 * hidden native radio carries the value and the keyboard; the card is its
 * label, so the label draws the focus ring (app/globals.css, #2240).
 */
export function RadioOptionCard({
  name,
  value,
  checked,
  onChange,
  disabled = false,
  title,
  badge,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  title: ReactNode;
  /** The pill beside the title. */
  badge?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-[64px] cursor-pointer gap-3 rounded-[14px] px-3.5 py-3 text-left text-text transition-colors duration-150 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${choiceStateClass(checked)}`}
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
      <SelectionMark checked={checked} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-serif text-[17px] font-semibold leading-[normal]">{title}</span>
          {badge}
        </span>
        {description && (
          <span className="mt-1 block font-sans text-xs leading-[1.4] text-muted">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
