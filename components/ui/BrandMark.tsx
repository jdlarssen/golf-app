/**
 * Brand mark: just the "Tørny" wordmark, sized for the upper-left of
 * authenticated pages. The full lockup (with champagne-dot accent + tagline)
 * lives in `<BrandHero />` for entry surfaces.
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <div
      className={`font-serif text-xl font-medium tracking-tight text-text leading-none ${className}`}
    >
      Tørny
    </div>
  );
}
