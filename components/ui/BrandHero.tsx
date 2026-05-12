/**
 * Brand-mark hero: "Tørny" wordmark + a champagne dot just past the "y" +
 * the tagline below. Used on /login as the page heading, standing on the
 * linen background above the form card.
 *
 * Faithful to `brand-mark.svg` in
 * `docs/design/realized/brand-foundations/assets/`. The dot is the brand
 * accent — small enough to read as punctuation, gold enough to belong.
 *
 * Heading ownership: this component renders the page heading. One per page.
 * If a future callsite needs different semantics, refactor to a polymorphic
 * `as` prop at that time.
 */
export function BrandHero({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <div className="flex items-start gap-1.5">
        <h1 className="font-serif text-5xl font-medium tracking-tight text-text leading-none m-0">
          Tørny
        </h1>
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-4"
        />
      </div>

      <p className="mt-4 font-sans text-sm leading-relaxed text-muted max-w-[260px]">
        Fyr opp golfturneringen på et{' '}
        <span className="text-accent font-semibold">par</span> minutter
      </p>
    </div>
  );
}
