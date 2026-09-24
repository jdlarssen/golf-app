import { BrandMark } from './BrandMark';

/**
 * Brand-mark hero: the «Tørny» wordmark (ball on the T, #1985) + the tagline
 * below. Used on /login as the page heading, standing on the linen background
 * above the form card.
 *
 * Faithful to `brand-mark.svg` in
 * `docs/design/realized/brand-foundations/assets/`. The wordmark itself is
 * `<BrandMark size="lg" />` — the ball lives there and nowhere else on the web.
 *
 * Heading ownership: this component renders the page heading. One per page.
 * If a future callsite needs different semantics, refactor to a polymorphic
 * `as` prop at that time.
 */
export function BrandHero({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <h1 className="m-0">
        <BrandMark size="lg" />
      </h1>

      <p className="mt-4 font-sans text-sm leading-relaxed text-muted max-w-[260px]">
        Fyr opp golfturneringen på et{' '}
        <span className="text-accent font-semibold">par</span> minutter
      </p>
    </div>
  );
}
