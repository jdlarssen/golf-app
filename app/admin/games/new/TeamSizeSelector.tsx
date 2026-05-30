'use client';

import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';

/**
 * Kanoniske lagstørrelser som UI-en kjenner til. Holdes som union for å gi
 * narrowing — andre tall (3, 5, ...) er ikke meningsfulle i Tørny per d.d.
 */
export type TeamSize = 1 | 2 | 3 | 4;

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
 * Mapping fra modus til hvilke lagstørrelser som er aktive.
 * Andre kombinasjoner vises grayed-out med «kommer snart» — eksplisitt
 * design-beslutning per epic #41 + #43-planen:
 *
 *  - Modus = Stableford → Solo + Par aktiv (4-mann kommer)
 *  - Modus = Best ball → kun Par aktiv (solo/4-mann kommer)
 *
 * Par-stableford (4BBB) ble aktivert i epic #43 fase 2 — scoring-motoren
 * og payload-validatoren landet i fase 1 (PR #151), og lag-fordelings-
 * UI-en utvides i fase 2 til å støtte 1-4 lag à 2 spillere (2/4/6/8
 * spillere totalt, ingen 8-krav som best-ball-netto).
 *
 * Singles matchplay (epic #45) krever team_size=1 (én spiller per side,
 * nøyaktig 2 sider). Scoring-motoren og payload-validatoren landet i
 * fase 1; ModeSelector og GameForm wires inn matchplay i fase 2.
 *
 * Solo strokeplay (epic #46) krever team_size=1 (én spiller = én rad).
 * Scoring-motoren og payload-validatoren landet i fase 1; ModeSelector
 * wires inn modusen i fase 2 — inntil da har modusen ingen UI-eksponering.
 *
 * Texas scramble (issue #44) tillater team_size 2 eller 4 (3-mannslag utsatt
 * til v1.1). NGF-konvensjon: 25 % team-handicap for 2-mannslag, 10 % for
 * 4-mannslag — settes som default i GameForm når lagstørrelse endres.
 *
 * Ved fremtidige moduser utvider vi denne mappen — ingen DB-migrasjon eller
 * payload-endring nødvendig før en konkret kombinasjon er implementert.
 */
const ENABLED_COMBOS: Record<GameMode, ReadonlySet<TeamSize>> = {
  stableford: new Set<TeamSize>([1, 2]),
  // Modified stableford (#281): samme solo/par-valg som standard Stableford.
  modified_stableford: new Set<TeamSize>([1, 2]),
  best_ball: new Set<TeamSize>([2]),
  singles_matchplay: new Set<TeamSize>([1]),
  solo_strokeplay: new Set<TeamSize>([1]),
  texas_scramble: new Set<TeamSize>([2, 4]),
  // Ambrose (#284): samme lagstørrelser som Texas scramble (2 eller 4).
  ambrose: new Set<TeamSize>([2, 4]),
  // Florida Scramble (#283): lagstørrelser 3 eller 4 (2-mannslag ikke støttet).
  florida_scramble: new Set<TeamSize>([3, 4]),
  fourball_matchplay: new Set<TeamSize>([2]),
  foursomes_matchplay: new Set<TeamSize>([2]),
  // Wolf: hver av de 4 spillerne er sin egen «row» (team_size=1). Selve
  // team_number-feltet brukes som rotation-slot 1-4, ikke som lag-tildeling.
  // TeamSizeSelector vises ikke for wolf (WolfSetup tar over), så denne
  // entry-en er kun for type-completeness på ENABLED_COMBOS-mappen.
  wolf: new Set<TeamSize>([1]),
  // Nassau: solo-format, 2-4 spillere. TeamSizeSelector vises ikke for
  // nassau (NassauSetup tar over), så denne brukes ikke i praksis — men
  // type-system krever en entry.
  nassau: new Set<TeamSize>([1]),
  // Skins: solo-format, 2-4 spillere. TeamSizeSelector vises ikke for skins
  // (SkinsSetup tar over), så denne brukes ikke i praksis — men type-system
  // krever en entry.
  skins: new Set<TeamSize>([1]),
  // Bingo Bango Bongo: individuelt format, 2–4 spillere, team_size=1. En
  // dedikert BBB-setup-steg vil ta over som for Wolf/Nassau/Skins, så
  // TeamSizeSelector vises ikke i praksis — men type-system krever en entry.
  bingo_bango_bongo: new Set<TeamSize>([1]),
  // Nines / Split Sixes: individuelt format, nøyaktig 3 spillere, team_size=1.
  // NinesSetup tar over som for Wolf/Nassau/Skins, så TeamSizeSelector vises
  // ikke i praksis — men type-system krever en entry.
  nines: new Set<TeamSize>([1]),
  // Round Robin: 4-spiller roterende-partner, team_size=1 (hver spiller er
  // sin egen row, team_number=rotation-slot). En dedikert RoundRobinSetup
  // vil ta over wizard-steget, så TeamSizeSelector vises ikke i praksis —
  // men type-system krever en entry.
  round_robin: new Set<TeamSize>([1]),
  // Acey Deucey: individuelt format, eksakt 4 spillere, team_size=1. En
  // dedikert setup-steg tar over (speiler Wolf/Skins/Nassau), så
  // TeamSizeSelector vises ikke i praksis — men type-system krever en entry.
  acey_deucey: new Set<TeamSize>([1]),
  // Shamble / Champagne Scramble: lag-format à 3 eller 4. ShambleSetup tar
  // over med sin egen 3/4-velger, så TeamSizeSelector vises ikke for shamble —
  // men type-system krever en entry. Begge støttede størrelser listet for
  // dokumentasjonsformål (generisk selector kan ikke vise 3 uansett).
  shamble: new Set<TeamSize>([3, 4]),
};

type TileDef = {
  size: TeamSize;
  title: string;
  /** Kort under-tekst — antall spillere per lag, kompakt format. */
  hint: string;
};

/**
 * Tiles for en gitt modus. Size-2-tilen er mode-bevisst: for stableford-
 * familien ER team_size 2 nettopp 4BBB (beste poeng per hull teller), så den
 * vises som «4BBB» med forklarende hint i stedet for et kryptisk «Par» (#282).
 * Andre lag-moduser (best ball, texas, fourball, foursomes) er IKKE 4BBB-
 * stableford og beholder «Par».
 *
 * Florida Scramble (#283) viser 3-mannstile i stedet for Solo/Par — modusen
 * støtter lagstørrelser 3 og 4, ikke 1 og 2.
 */
function tilesForMode(mode: GameMode): TileDef[] {
  if (mode === 'florida_scramble') {
    return [
      { size: 3, title: 'Tremannslag', hint: '3 spillere' },
      { size: 4, title: '4-mann', hint: '4 spillere' },
    ];
  }
  const teamTile: TileDef = isStablefordFamily(mode)
    ? { size: 2, title: '4BBB', hint: 'Lag à 2, beste poeng teller' }
    : { size: 2, title: 'Par', hint: '2 spillere' };
  return [
    { size: 1, title: 'Solo', hint: '1 spiller' },
    teamTile,
    { size: 4, title: '4-mann', hint: '4 spillere' },
  ];
}

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
  const tiles = tilesForMode(mode);

  return (
    <fieldset disabled={disabled}>
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Velg lagstørrelse
      </legend>
      <div role="radiogroup" className={`mt-2 grid gap-3 ${tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {tiles.map((tile) => {
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
