import { MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';

/**
 * Subtil chip som indikerer spillmodus (Best ball / Stableford) per spill-rad
 * i admin-flater. Bevisst lavmælt sammenlignet med `StatusChip` — modus er
 * permanent metadata om spillet, ikke en lifecycle-status som krever
 * oppmerksomhet. Derfor:
 *
 *  - Sans 9.5px, IKKE uppercase (modus-navn er noun-phraser, ikke stempler)
 *  - Border + transparent bg fremfor heldekkende stamp-tone
 *  - Færre uthevningspoeng (ingen letter-spacing-stretch)
 *
 * Brukes i admin/games-listen (per rad) og admin/games/[id]-detalj-siden
 * (ved siden av status-chip-en) for å gi admin et raskt overblikk over
 * hvilken modus hvert spill er konfigurert for.
 */
export function ModeChip({
  mode,
  className,
}: {
  mode: GameMode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full border px-[7px] py-[2px] font-sans text-[9.5px] font-medium ${className ?? ''}`}
      style={{
        borderColor: 'var(--border)',
        background: 'transparent',
        color: 'var(--text-muted)',
      }}
    >
      {MODE_LABELS[mode]}
    </span>
  );
}
