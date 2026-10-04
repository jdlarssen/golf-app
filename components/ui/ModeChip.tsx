import { MODE_LABELS, type GameMode, type GameModeConfig } from '@/lib/scoring/modes/types';
import { formatDisplayLabel } from '@/lib/games/formatLabel';

/** The chip's text, also for a link name that has to say what the chip shows. */
export function modeChipLabel(mode: GameMode, modeConfig?: GameModeConfig): string {
  return modeConfig ? formatDisplayLabel(mode, modeConfig) : MODE_LABELS[mode];
}

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
  modeConfig,
  className,
}: {
  mode: GameMode;
  /**
   * Valgfri mode-config. Når satt vises variant-bevisst navn («4BBB Stableford»
   * for team_size 2) via formatDisplayLabel; ellers faller chipen tilbake til
   * MODE_LABELS[mode]. Optional så call-sites uten config-tilgang ikke tvinges
   * til å endre (#282).
   */
  modeConfig?: GameModeConfig;
  className?: string;
}) {
  const label = modeChipLabel(mode, modeConfig);
  return (
    <span
      className={`inline-block rounded-full border px-[7px] py-[2px] font-sans text-[9.5px] font-medium ${className ?? ''}`}
      style={{
        borderColor: 'var(--border)',
        background: 'transparent',
        color: 'var(--text-muted)',
      }}
    >
      {label}
    </span>
  );
}
