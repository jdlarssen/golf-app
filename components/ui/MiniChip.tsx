import type { ReactNode } from 'react';

/**
 * The new-game wizard's small uppercase pill (#2321): 22 px high, 10 px / 600
 * at 0.1em, as the step 4 artboards draw «VENTER» and «LAG 1».
 * - `waiting`: pale amber, for a player who has not finished their profile.
 * - `neutral`: the inset surface, for «LAG 1» on a flight row and «Ikke plass»
 *   in the e-mail list.
 */
const TONES = {
  waiting: 'bg-warning-soft text-warning-text',
  neutral: 'bg-surface-2 text-muted',
} as const;

export function MiniChip({
  tone,
  children,
  className = '',
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.1em] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
