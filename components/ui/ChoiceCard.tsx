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
 */

/** `centered`: the shamble count's 1/2/3. `dense`: three tiles a row (Texas team size). */
export type ChoiceCardLayout = 'start' | 'centered' | 'dense';

/**
 * Min heights the artboards draw. The card grows past it when the title wraps.
 * Classes are spelled out so Tailwind sees them.
 */
const MIN_HEIGHT = {
  60: 'min-h-[60px]',
  64: 'min-h-[64px]',
  72: 'min-h-[72px]',
} as const;
export type ChoiceCardHeight = keyof typeof MIN_HEIGHT;

export function choiceCardClass(
  selected: boolean,
  { height = 60, layout = 'start' }: { height?: ChoiceCardHeight; layout?: ChoiceCardLayout } = {},
): string {
  const align =
    layout === 'centered' ? 'items-center text-center px-3' : layout === 'dense' ? 'items-start text-left px-2.5' : 'items-start text-left px-3';
  const state = selected
    ? 'border-2 border-primary bg-primary-soft'
    : 'border border-border bg-surface hover:bg-primary-soft/60';
  return `relative flex ${MIN_HEIGHT[height]} cursor-pointer flex-col justify-center rounded-[14px] py-2.5 text-text transition-colors duration-150 ${align} ${state}`;
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
  className = '',
  children,
}: {
  columns: keyof typeof GRID_COLS;
  /** Names the radiogroup for screen readers. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${GRID_COLS[columns]} ${className}`}>
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
  name: string;
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
