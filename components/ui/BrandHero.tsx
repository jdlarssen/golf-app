import { ChampagneMedallion } from './ChampagneMedallion';
import { PinFlag } from '@/components/icons/PinFlag';

/**
 * Entry-surface hero: medallion + forest T-tile + "Tørny" wordmark +
 * champagne-tinted tagline. Used on /login. Distinct from `<BrandMark />`,
 * which is the small navigational lockup at the top of authenticated pages.
 *
 * The "par" word in the tagline is rendered in `text-accent` to mirror the
 * brand-mark.svg in `docs/design/realized/brand-foundations/assets/`.
 */
export function BrandHero({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <ChampagneMedallion className="mb-6">
        <PinFlag size={56} className="text-primary dark:text-text" />
      </ChampagneMedallion>

      <div className="w-14 h-14 rounded-2xl bg-primary text-white grid place-items-center font-serif font-medium text-2xl shadow-sm mb-3">
        T
      </div>

      <span className="font-serif text-3xl font-medium tracking-tight text-text leading-none">
        Tørny
      </span>

      <p className="mt-3 font-sans text-sm leading-relaxed text-muted max-w-[260px]">
        Fyr opp golfturneringen på et{' '}
        <span className="text-accent font-semibold">par</span> minutter
      </p>
    </div>
  );
}
