'use client';

import type { ReactNode } from 'react';
import type { Intent } from '@/lib/wizard/intent';
import { INTENT_LABELS, INTENT_DESCRIPTIONS } from '@/lib/wizard/intent';

type Props = {
  value: Intent | undefined;
  onChange: (intent: Intent) => void;
  /**
   * Edit-flyten: når et publisert spill redigeres, holdes intent-en synlig
   * men ikke endrebar. Backend mode-lock-en har siste ord, men UI-en speiler
   * det for å unngå utilsiktet validation-error.
   */
  disabled?: boolean;
};

type IntentTile = {
  intent: Intent;
  icon: ReactNode;
};

// Kompis: to stiliserte figurer skulder-mot-skulder, signaliserer
// «vennegjeng». Holder samme stroke-vekt og rounded caps som format-ikonene
// så ikon-språket forblir konsistent.
const KompisIcon = (
  <svg width={32} height={32} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="10" r="3.5" />
    <circle cx="21" cy="10" r="3.5" />
    <path d="M 4 27 C 4 21 7 18 11 18 C 15 18 18 21 18 27" />
    <path d="M 14 27 C 14 21 17 18 21 18 C 25 18 28 21 28 27" />
  </svg>
);

// Klubb: stilisert pokal / klubb-trofé. Signaliserer organisert turnering
// med flere deltakere.
const KlubbIcon = (
  <svg width={32} height={32} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M 10 5 L 22 5 L 22 13 C 22 17 19 20 16 20 C 13 20 10 17 10 13 Z" />
    <path d="M 10 8 L 6 8 C 6 12 8 14 10 14" />
    <path d="M 22 8 L 26 8 C 26 12 24 14 22 14" />
    <line x1="16" y1="20" x2="16" y2="24" />
    <path d="M 11 27 L 21 27 L 20 24 L 12 24 Z" />
  </svg>
);

// Cup: to lag-flagg som speiler hverandre med en sentral linje — signaliserer
// to-lag-format med flere matcher. Bevisst forskjellig fra format-ikonene
// (matchplay/best_ball) så det ikke leser som ett enkelt-format-valg.
const CupIcon = (
  <svg width={32} height={32} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="7" y1="6" x2="7" y2="26" />
    <path d="M 7 7 L 14 9 L 7 11 Z" fill="currentColor" stroke="none" />
    <line x1="25" y1="6" x2="25" y2="26" />
    <path d="M 25 7 L 18 9 L 25 11 Z" fill="currentColor" stroke="none" />
    <line x1="16" y1="14" x2="16" y2="26" strokeDasharray="2 2" />
    <text x="16" y="22" fontSize="9" fontFamily="serif" fontWeight="600" stroke="none" fill="currentColor" textAnchor="middle">vs</text>
  </svg>
);

// Solo: enkelt golfflagg + ball, signaliserer «én spiller, øvelse».
const SoloIcon = (
  <svg width={32} height={32} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="16" y1="5" x2="16" y2="22" />
    <path d="M 16 6 L 24 8 L 16 10 Z" fill="currentColor" stroke="none" />
    <circle cx="16" cy="25" r="2.5" />
  </svg>
);

const TILES: IntentTile[] = [
  { intent: 'kompis', icon: KompisIcon },
  { intent: 'klubb', icon: KlubbIcon },
  { intent: 'cup', icon: CupIcon },
  { intent: 'solo', icon: SoloIcon },
];

/**
 * IntentSelector — wizard step 1, intent-først pickeren. Erstatter dagens
 * flate ModeSelector. 4 store kort i 2x2 mobil-grid med ikon over tekst.
 *
 * ARIA: radiogroup-mønster (radio-role per kort med aria-checked). Bruker
 * button-elementer, ikke `<input type="radio">`, fordi tile-presentasjonen
 * krever full kontroll over layout.
 *
 * Mobile-først: 2-col grid, ≥44px tap-targets (kortene blir ~140px høye
 * pga padding + ikon + tekst).
 */
export function IntentSelector({ value, onChange, disabled = false }: Props) {
  return (
    <fieldset disabled={disabled}>
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Hva slags arrangement?
      </legend>
      <div
        role="radiogroup"
        aria-label="Hva slags arrangement?"
        className="mt-2 grid grid-cols-2 gap-3"
      >
        {TILES.map((tile) => {
          const selected = value === tile.intent;
          return (
            <button
              key={tile.intent}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={INTENT_LABELS[tile.intent]}
              disabled={disabled}
              onClick={() => {
                if (!disabled) onChange(tile.intent);
              }}
              className={`flex min-h-[140px] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
                  : 'border-border bg-surface text-text hover:bg-primary-soft/60'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center ${
                  selected ? 'text-primary' : 'text-muted'
                }`}
              >
                {tile.icon}
              </span>
              <span className="font-serif text-base leading-snug">
                {INTENT_LABELS[tile.intent]}
              </span>
              <span className="font-sans text-xs leading-snug text-muted">
                {INTENT_DESCRIPTIONS[tile.intent]}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
