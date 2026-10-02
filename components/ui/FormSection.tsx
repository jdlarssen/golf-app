import type { FieldsetHTMLAttributes, ReactNode } from 'react';

type Props = Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'children'> & {
  /** The kicker over the card. It is the fieldset's legend, so it also names the group. */
  legend: ReactNode;
  children: ReactNode;
  /**
   * `card` (default): the children sit in a card with a 14 px inset.
   * `bare`: no card — the children sit straight on the page, as the team size
   * tiles do.
   * `list`: a card without inset whose children are rows split by the warm
   * divider (the switch rows on step 5, #2282; the lists on step 4, #2321).
   */
  variant?: 'card' | 'bare' | 'list';
  /**
   * Space between the card's children: 10 px for the prize table, 12 px, or
   * 14 px for step 3's fields.
   */
  gap?: 'sm' | 'md' | 'lg';
  /**
   * Keep the legend for screen readers only: the peer-approval card on step 5
   * has no kicker (#2282).
   */
  legendHidden?: boolean;
};

/**
 * The frame of a card whose rows run edge to edge: the «Klar?» checklist, the
 * switch rows on step 5 and `FormSection variant="list"`. The rows are
 * clipped by the rounded corners, so the global focus ring would be cut away;
 * `data-focus-inset` draws it inside the row instead (app/globals.css, #1402).
 */
export const LIST_CARD_CLASS =
  'divide-y divide-row-divider-warm overflow-hidden rounded-2xl border border-border bg-surface';

/**
 * The new-game wizard's section frame (#2426): an uppercase kicker over a
 * card with rounded corners, as «ANDRE SOM PASSER» over the format rows (#2260).
 * Every setup section on steps 2 and 3 uses it.
 *
 * The kicker sits 4 px inside the card's edge, as on the artboards. The wizard
 * gives the card its 16 px page margin by pulling its column out 4 px
 * (`-mx-1`) around the sections; here the legend takes the 4 px back.
 */
export function FormSection({
  legend,
  children,
  variant = 'card',
  gap = 'md',
  legendHidden = false,
  className = '',
  ...rest
}: Props) {
  return (
    <fieldset {...rest} className={`min-w-0 ${className}`}>
      <legend
        className={
          legendHidden
            ? 'sr-only'
            : 'px-1 pb-2 pt-[18px] font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-muted'
        }
      >
        {legend}
      </legend>
      {variant === 'list' ? (
        <div data-focus-inset className={LIST_CARD_CLASS}>
          {children}
        </div>
      ) : variant === 'card' ? (
        <div
          className={`flex flex-col rounded-2xl border border-border bg-surface p-3.5 ${
            gap === 'lg' ? 'gap-3.5' : gap === 'sm' ? 'gap-2.5' : 'gap-3'
          }`}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </fieldset>
  );
}

/** A group heading inside a section card: «Scoring», «Variant», «Poeng fra». */
export function FormSectionHeading({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div>
      <p className="font-sans text-sm font-semibold leading-[normal] text-text">{title}</p>
      {description && (
        <p className="mt-0.5 font-sans text-[13px] leading-[1.45] text-muted">{description}</p>
      )}
    </div>
  );
}

/** Body text inside a section card, 13 px muted. */
export function FormSectionText({ children }: { children: ReactNode }) {
  return <p className="font-sans text-[13px] leading-[1.45] text-muted">{children}</p>;
}
