'use client';

import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Kanoniske lagstørrelser som UI-en kjenner til. Holdes som union for å gi
 * narrowing — andre tall (3, 5, ...) er ikke meningsfulle i Tørny per d.d.
 */
export type TeamSize = 1 | 2 | 4;

type Props = {
  /** Valgt spillmodus styrer hvilke tiles som er aktive. */
  mode: GameMode;
  value: TeamSize;
  onChange: (size: TeamSize) => void;
  /**
   * Disabled-flagg for edit-flyten: når et publisert spill redigeres kan
   * verken modus eller lagstørrelse byttes (DB-rader er allerede skrevet
   * mot modusen). Backend mode-lock-guard har siste ord — denne propen
   * forhindrer at admin uvitende trigger en validation error.
   */
  disabled?: boolean;
};

/**
 * Mapping fra modus til hvilke lagstørrelser som er aktive i v1.
 * Andre kombinasjoner vises grayed-out med «kommer snart» — eksplisitt
 * design-beslutning per epic #41-planen:
 *
 *  - Modus = Stableford → kun Solo aktiv (par/4-mann kommer)
 *  - Modus = Best ball netto → kun Par aktiv (solo/4-mann kommer)
 *
 * Ved fremtidige moduser (matchplay #45, scramble #44, etc.) utvider vi
 * denne mappen — ingen DB-migrasjon eller payload-endring nødvendig før
 * en konkret kombinasjon er implementert.
 */
const ENABLED_COMBOS: Record<GameMode, ReadonlySet<TeamSize>> = {
  stableford: new Set<TeamSize>([1]),
  best_ball_netto: new Set<TeamSize>([2]),
};

type TileDef = {
  size: TeamSize;
  title: string;
  /** Kort under-tekst — antall spillere per lag, kompakt format. */
  hint: string;
};

const TILES: TileDef[] = [
  { size: 1, title: 'Solo', hint: '1 spiller' },
  { size: 2, title: 'Par', hint: '2 spillere' },
  { size: 4, title: '4-mann', hint: '4 spillere' },
];

/**
 * Lagstørrelse-velger — tre tiles (Solo / Par / 4-mann) der den aktive
 * tilen styres av valgt modus. Disabled tiles vises med «kommer snart»-
 * subscript så admin ser hvor roadmap-en bærer uten å trenge eksplisitt
 * roadmap-side.
 *
 * Visuell konsistens: tile-stilen speiler `ModeSelector` (border, padding,
 * active-state via primary-soft + inset-ring) men droper ikon — per design-
 * dokumentet er lagstørrelse en sekundær parameter og fortjener ikke samme
 * symbolske vekting som modus-valget.
 */
export function TeamSizeSelector({
  mode,
  value,
  onChange,
  disabled = false,
}: Props) {
  const enabledSet = ENABLED_COMBOS[mode];

  return (
    <fieldset disabled={disabled}>
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Velg lagstørrelse
      </legend>
      <div role="radiogroup" className="mt-2 grid grid-cols-3 gap-3">
        {TILES.map((tile) => {
          const isEnabled = enabledSet.has(tile.size);
          const selected = value === tile.size;
          const tileDisabled = disabled || !isEnabled;
          return (
            <button
              key={tile.size}
              type="button"
              role="radio"
              aria-checked={selected && isEnabled}
              aria-label={tile.title}
              aria-disabled={tileDisabled || undefined}
              disabled={tileDisabled}
              onClick={() => {
                if (!tileDisabled) onChange(tile.size);
              }}
              className={`flex min-h-[44px] flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                tileDisabled
                  ? 'cursor-not-allowed border-border bg-surface opacity-50'
                  : selected
                    ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
                    : 'cursor-pointer border-border bg-surface text-text hover:bg-primary-soft/60'
              }`}
            >
              <span className="font-serif text-base leading-snug">
                {tile.title}
              </span>
              <span className="font-sans text-[11px] leading-snug text-muted tabular-nums">
                {tile.hint}
              </span>
              {!isEnabled && (
                <span className="font-sans text-[10px] font-medium uppercase tracking-[0.12em] text-accent-deep">
                  Kommer snart
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
