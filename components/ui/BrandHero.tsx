import { ChampagneMedallion } from './ChampagneMedallion';
import { PinFlag } from '@/components/icons/PinFlag';

/**
 * Entry-surface hero: medallion + forest T-tile + "Tørny" wordmark (as the
 * page `<h1>`) + champagne-tinted tagline. Used on /login. Distinct from
 * `<BrandMark />`, which is the small navigational lockup at the top of
 * authenticated pages.
 *
 * The "par" word in the tagline is rendered in `text-accent` to mirror
 * brand-mark.svg in `docs/design/realized/brand-foundations/assets/`. The
 * medallion+PinFlag stack above is the same vocabulary used by the
 * authenticated empty-state hero in `app/page.tsx`.
 *
 * Heading ownership: this component renders the page heading. One per page.
 * If a future callsite needs different semantics, refactor to a polymorphic
 * `as` prop at that time.
 */
export function BrandHero({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <ChampagneMedallion className="mb-6">
        <PinFlag size={56} className="text-primary dark:text-text" />
      </ChampagneMedallion>

      <div
        aria-hidden="true"
        className="w-14 h-14 rounded-2xl bg-primary text-white grid place-items-center font-serif font-medium text-2xl shadow-sm mb-3"
      >
        T
      </div>

      <h1 className="font-serif text-3xl font-medium tracking-tight text-text leading-none m-0">
        Tørny
      </h1>

      <p className="mt-3 font-sans text-sm leading-relaxed text-muted max-w-[260px]">
        Fyr opp golfturneringen på et{' '}
        <span className="text-accent font-semibold">par</span> minutter
      </p>
    </div>
  );
}
