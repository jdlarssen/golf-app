/**
 * Brand mark: serif "T" in a softly-rounded forest square, the wordmark
 * "Tørny" beside it, and a tiny champagne-tinted "Turnering" tagline.
 * Used at the top of public surfaces (home, login).
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-9 h-9 rounded-xl bg-primary text-white grid place-items-center font-serif font-medium text-lg shadow-sm">
        T
      </div>
      <div className="flex flex-col">
        <span className="font-serif text-base font-medium tracking-tight text-text leading-none">
          Tørny
        </span>
        <span className="text-[10px] text-muted uppercase tracking-widest leading-none mt-0.5">
          Turnering
        </span>
      </div>
    </div>
  );
}
