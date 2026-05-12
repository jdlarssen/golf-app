/**
 * Brass section divider: two stacked 1px hairlines (champagne over warm beige)
 * bracketing a champagne kicker in the middle. Used directly under headers on
 * admin "protokoll" surfaces.
 */
export function BrassRibbon({ kicker }: { kicker: string }) {
  return (
    <div className="flex items-center gap-2.5 px-[18px] pt-1 pb-3.5">
      <Hairlines />
      <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-accent whitespace-nowrap">
        {kicker}
      </span>
      <Hairlines />
    </div>
  );
}

function Hairlines() {
  return (
    <span className="relative block h-1.5 flex-1">
      <span
        aria-hidden
        className="absolute left-0 right-0 block h-px"
        style={{ top: 1, background: 'var(--brass-line-top)' }}
      />
      <span
        aria-hidden
        className="absolute left-0 right-0 block h-px"
        style={{ top: 5, background: 'var(--brass-line-bottom)' }}
      />
    </span>
  );
}
