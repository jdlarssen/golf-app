import type { FieldsetHTMLAttributes, ReactNode } from 'react';

type Props = Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'children'> & {
  /** The kicker over the card. It is the fieldset's legend, so it also names the group. */
  legend: ReactNode;
  children: ReactNode;
  /**
   * `card` (default): the children sit in a card with a 14 px inset.
   * `bare`: no card — the children sit straight on the page, as the team size
   * tiles do.
   */
  variant?: 'card' | 'bare';
  /** Space between the card's children: 12 px, or 14 px for step 3's fields. */
  gap?: 'md' | 'lg';
};

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
  className = '',
  ...rest
}: Props) {
  return (
    <fieldset {...rest} className={`min-w-0 ${className}`}>
      <legend className="px-1 pb-2 pt-[18px] font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-muted">
        {legend}
      </legend>
      {variant === 'card' ? (
        <div
          className={`flex flex-col rounded-2xl border border-border bg-surface p-3.5 ${
            gap === 'lg' ? 'gap-3.5' : 'gap-3'
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
