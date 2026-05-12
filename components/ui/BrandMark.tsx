/**
 * Brand mark: "Tørny" wordmark with a tiny champagne dot just past the "y",
 * sized for the upper-left of authenticated pages. The full lockup (with
 * tagline) lives in `<BrandHero />` for entry surfaces.
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-start gap-1 ${className}`}>
      <span className="font-serif text-xl font-medium tracking-tight text-text leading-none">
        Tørny
      </span>
      <span
        aria-hidden="true"
        className="w-[3px] h-[3px] rounded-full bg-accent shrink-0 mt-2"
      />
    </div>
  );
}
