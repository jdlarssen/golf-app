'use client';

import type { GameMode } from '@/lib/scoring/modes/types';

type Props = {
  value: GameMode;
  onChange: (mode: GameMode) => void;
  /**
   * Disabled-flagg for edit-flyten: når et publisert spill redigeres skal
   * modusen vises (so admin ser hva som er valgt), men ikke endres. Backend
   * mode-lock-guard har siste ord — denne propen forhindrer at admin uvitende
   * trigger en validation error.
   */
  disabled?: boolean;
};

type TileDef = {
  mode: GameMode;
  title: string;
  description: string;
  icon: React.ReactNode;
};

// Stableford-ikon: stilisert poeng-tavle med tre tall (signaliserer per-hull-
// poeng). Inline SVG fordi vi vil ha currentColor-toning (passer både
// champagne-aksent og dark-mode), og fordi ikonsettet for resten av appen
// allerede inlines (`components/icons/Icons.tsx`). 28×28 view-port matcher
// hierarki — litt større enn 24px line-icons, mindre enn 64px hero-illustrations.
const StablefordIcon = (
  <svg
    width={28}
    height={28}
    viewBox="0 0 28 28"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {/* Plate-shape med rounded corners (poeng-tavle-pattern). */}
    <rect x="3.5" y="4.5" width="21" height="19" rx="2" />
    {/* Tre cells (en per «hull» med poeng). Tunge tall-skiller. */}
    <line x1="10.5" y1="4.5" x2="10.5" y2="23.5" />
    <line x1="17.5" y1="4.5" x2="17.5" y2="23.5" />
    {/* Tre tall — 2 (par), 3 (birdie), 4 (eagle) — stiliserte poeng. */}
    <text
      x="7"
      y="17"
      fontSize="9"
      fontFamily="serif"
      fontWeight="600"
      stroke="none"
      fill="currentColor"
      textAnchor="middle"
    >
      2
    </text>
    <text
      x="14"
      y="17"
      fontSize="9"
      fontFamily="serif"
      fontWeight="600"
      stroke="none"
      fill="currentColor"
      textAnchor="middle"
    >
      3
    </text>
    <text
      x="21"
      y="17"
      fontSize="9"
      fontFamily="serif"
      fontWeight="600"
      stroke="none"
      fill="currentColor"
      textAnchor="middle"
    >
      4
    </text>
  </svg>
);

// Best-ball-ikon: 2×2-grid av små flagg-stenger. Signaliserer fire lag.
// Stilen matcher `FlaggIcon` i Icons.tsx (line-icon, 1.5 stroke, rounded caps)
// så ikon-språket forblir konsistent.
const BestBallIcon = (
  <svg
    width={28}
    height={28}
    viewBox="0 0 28 28"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {/* Fire flagg-stenger, ett per quadrant. Hver: stang + lite vimpel-trekant. */}
    {/* Top-left */}
    <line x1="6" y1="3" x2="6" y2="12" />
    <path d="M 6 4 L 11 5.5 L 6 7 Z" fill="currentColor" stroke="none" />
    {/* Top-right */}
    <line x1="18" y1="3" x2="18" y2="12" />
    <path d="M 18 4 L 23 5.5 L 18 7 Z" fill="currentColor" stroke="none" />
    {/* Bottom-left */}
    <line x1="6" y1="16" x2="6" y2="25" />
    <path d="M 6 17 L 11 18.5 L 6 20 Z" fill="currentColor" stroke="none" />
    {/* Bottom-right */}
    <line x1="18" y1="16" x2="18" y2="25" />
    <path d="M 18 17 L 23 18.5 L 18 20 Z" fill="currentColor" stroke="none" />
  </svg>
);

// Matchplay-ikon: to flagg-stenger speilet mot hverandre med et lite «vs»-
// punkt i midten. Signaliserer 1v1-duell uten å låne fra typiske «sverd»-
// metaforer (skulle ikke nødvendigvis være krig — det er to spillere som
// møter hverandre). Holder samme stroke-vekt og rounded caps som de andre
// tile-ikonene for visuell konsistens.
const MatchplayIcon = (
  <svg
    width={28}
    height={28}
    viewBox="0 0 28 28"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {/* Venstre flagg-stenger (side 1) — peker mot høyre. */}
    <line x1="6" y1="5" x2="6" y2="23" />
    <path d="M 6 6 L 11 7.5 L 6 9 Z" fill="currentColor" stroke="none" />
    {/* Høyre flagg-stenger (side 2) — peker mot venstre, speilet. */}
    <line x1="22" y1="5" x2="22" y2="23" />
    <path d="M 22 6 L 17 7.5 L 22 9 Z" fill="currentColor" stroke="none" />
    {/* «vs»-prikk i midten av baselinen. */}
    <circle cx="14" cy="17" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

// Texas scramble-ikon: ett senterstilt flagg med tre små golfballer
// gruppert under — signaliserer at hele laget samles om én ball, som er
// den definerende mekanikken for Texas (lag-medlemmene velger beste slag
// og slår alle derfra). Holder samme stroke-vekt og rounded caps som de
// andre tile-ikonene for visuell konsistens.
const TexasScrambleIcon = (
  <svg
    width={28}
    height={28}
    viewBox="0 0 28 28"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {/* Senterstilt flaggpinne. */}
    <line x1="14" y1="3" x2="14" y2="18" />
    <path d="M 14 4 L 21 5.5 L 14 7 Z" fill="currentColor" stroke="none" />
    {/* Tre små golfballer pa rad under flagget — lag-medlemmene som spiller felles ball. */}
    <circle cx="8" cy="22" r="2" />
    <circle cx="14" cy="22" r="2" />
    <circle cx="20" cy="22" r="2" />
  </svg>
);

// Strokeplay-ikon: enkelt scorekort med en blyant-stripe ned siden. Signaliserer
// klassisk slagspill der hver spiller fører eget kort og lavest total vinner.
// Holder samme stroke-vekt og rounded caps som de andre tile-ikonene for
// visuell konsistens. Bevisst minimal — kortet alene leser tydeligst på 28px,
// og blyanten gir kontekst uten å konkurrere med andre tile-symboler.
const StrokeplayIcon = (
  <svg
    width={28}
    height={28}
    viewBox="0 0 28 28"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {/* Scorekort-konvolutt (rounded rect). */}
    <rect x="5.5" y="4.5" width="14" height="19" rx="1.5" />
    {/* Tre score-linjer på kortet (representerer hull-rader). */}
    <line x1="8.5" y1="9.5" x2="16.5" y2="9.5" />
    <line x1="8.5" y1="13" x2="16.5" y2="13" />
    <line x1="8.5" y1="16.5" x2="16.5" y2="16.5" />
    {/* Blyant til høyre — diagonal stripe + spiss-trekant. */}
    <line x1="22" y1="7" x2="22" y2="19" />
    <path d="M 21 19 L 22 21.5 L 23 19 Z" fill="currentColor" stroke="none" />
  </svg>
);

const TILES: TileDef[] = [
  {
    mode: 'stableford',
    title: 'Stableford',
    description:
      'Poeng per hull. Par = 2, birdie = 3, eagle = 4 osv. Høyest total vinner.',
    icon: StablefordIcon,
  },
  {
    mode: 'best_ball',
    title: 'Best ball',
    description: 'Sum av beste netto-resultat per hull per lag. Laveste vinner.',
    icon: BestBallIcon,
  },
  {
    mode: 'singles_matchplay',
    title: 'Matchplay',
    description: '1v1 hull-for-hull. Vinneren avgjøres som «X up» eller «X&Y».',
    icon: MatchplayIcon,
  },
  {
    mode: 'solo_strokeplay',
    title: 'Slagspill',
    description: 'Individuelt scorekort. Lavest netto-total vinner.',
    icon: StrokeplayIcon,
  },
  {
    mode: 'texas_scramble',
    title: 'Texas scramble',
    description: 'Laget spiller én ball. Velg beste slag hvert hull. Lavest lag-total vinner.',
    icon: TexasScrambleIcon,
  },
  {
    mode: 'ambrose',
    title: 'Ambrose',
    description: 'Lag à 2 eller 4. Alle slår, beste ball velges. Lag-handicap jevner ut forskjellene mellom lagene.',
    icon: TexasScrambleIcon,
  },
];

/**
 * Modus-velger — fem tiles som lar admin plukke spillmodus før lagstørrelse.
 * Hierarkiet er bevisst: modus er det semantisk distinkte hovedvalget
 * («hva avgjør vinneren?»), lagstørrelse er en sekundær parameter som
 * snevres inn etter modus.
 *
 * Grid: 2-kolonner på mobile-først (`grid-cols-2`) gir 2+2+1-stacking på
 * iPhone — komfortabel halv-bredde per tile. På sm-breakpoint (≥640px)
 * 3-kolonner = 3+2-rytme. På lg (≥1024px) 5-i-rad symmetrisk. Bevisst
 * unngår 4-kolonne på sm (5 tiles ville gitt 4+1-asymmetri).
 *
 * ARIA: bruker `role="radiogroup"` + `role="radio"` med tabbable button-er.
 * Vi bruker ikke `<input type="radio">` fordi tile-presentasjonen krever
 * full kontroll over layout (ikon over tekst, padding, border). `name` på
 * et hidden input bærer verdien i FormData — settes av GameForm, ikke her.
 */
export function ModeSelector({ value, onChange, disabled = false }: Props) {
  return (
    <fieldset disabled={disabled}>
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Velg spillmodus
      </legend>
      <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map((tile) => {
          const selected = value === tile.mode;
          return (
            <button
              key={tile.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={tile.title}
              disabled={disabled}
              onClick={() => {
                if (!disabled) onChange(tile.mode);
              }}
              className={`flex min-h-[44px] flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
                  : 'border-border bg-surface text-text hover:bg-primary-soft/60'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center ${
                  selected ? 'text-primary' : 'text-muted'
                }`}
              >
                {tile.icon}
              </span>
              <span className="font-serif text-base leading-snug">
                {tile.title}
              </span>
              <span className="font-sans text-xs leading-snug text-muted">
                {tile.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
