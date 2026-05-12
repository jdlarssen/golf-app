/**
 * Inline section-header ribbon for SectionCard-style cards: muted kicker on
 * the left, then a 1px champagne→transparent gradient hairline extending right.
 */
export function MiniRibbon({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 pt-2.5 pb-1.5">
      <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted whitespace-nowrap">
        {children}
      </span>
      <span
        aria-hidden
        className="block h-px flex-1"
        style={{
          background:
            'linear-gradient(90deg, var(--brass-line-top) 0%, transparent 90%)',
        }}
      />
    </div>
  );
}
