/**
 * Decorative club stamp — 54px circle, rotated -8°, with TØRNY · 1862 ·
 * text inside a champagne ring. Used as a corner mark on the Sekretariatet
 * salutation card. Never as a primary element.
 */
export function ClubStamp({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`flex h-[54px] w-[54px] -rotate-[8deg] items-center justify-center rounded-full text-center font-serif font-medium leading-[1.15] ${className ?? ''}`}
      style={{
        border: '1.5px solid var(--stamp-stroke)',
        color: 'var(--stamp-fill)',
        fontSize: 9,
        letterSpacing: '0.16em',
      }}
    >
      <span>
        TØRNY
        <br />
        ·1862·
      </span>
    </div>
  );
}
