'use client';

import { useTranslations } from 'next-intl';
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
 * Mapping fra modus til hvilke lagstørrelser formatet faktisk støtter.
 * `tilesForMode` viser kun disse — kombinasjoner som ikke gir mening (f.eks.
 * solo scramble) listes ikke i det hele tatt (#478, var tidligere grayed-out
 * «kommer snart»). Historikk per epic #41 + #43-planen:
 *
 *  - Modus = Stableford → Solo + 4BBB (par)
 *  - Modus = Best ball → kun Par
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
  // Greensome matchplay (#289): alltid 2-mannslag (2 spillere per side).
  // TeamSizeSelector vises ikke for greensome i praksis (cup-only-format),
  // men type-system krever en entry.
  greensome_matchplay: new Set<TeamSize>([2]),
  // Chapman (#290): 2v2 som foursomes. Cup-only — TeamSizeSelector vises ikke
  // i cup-match-wizarden, så denne er for type-completeness.
  chapman_matchplay: new Set<TeamSize>([2]),
  // Gruesome (#291): 2v2 som foursomes. Type-completeness (TeamSizeSelector
  // vises ikke for cup-only; standalone-path rendrer 2v2-grid direkte).
  gruesome_matchplay: new Set<TeamSize>([2]),
  // Wolf: hver av de 4 spillerne er sin egen «row» (team_size=1). Selve
  // team_number-feltet brukes som rotation-slot 1-4, ikke som lag-tildeling.
  // TeamSizeSelector vises ikke for wolf (WolfSetup tar over), så denne
  // entry-en er kun for type-completeness på ENABLED_COMBOS-mappen.
  wolf: new Set<TeamSize>([1]),
  // Nassau: solo-format, 2-16 spillere (#460). TeamSizeSelector vises ikke for
  // nassau (NassauSetup tar over), så denne brukes ikke i praksis — men
  // type-system krever en entry.
  nassau: new Set<TeamSize>([1]),
  // Skins: solo-format, 2-16 spillere (#460). TeamSizeSelector vises ikke for skins
  // (SkinsSetup tar over), så denne brukes ikke i praksis — men type-system
  // krever en entry.
  skins: new Set<TeamSize>([1]),
  // Bingo Bango Bongo: individuelt format, 2–16 spillere (#460), team_size=1. En
  // dedikert BBB-setup-steg vil ta over som for Wolf/Nassau/Skins, så
  // TeamSizeSelector vises ikke i praksis — men type-system krever en entry.
  bingo_bango_bongo: new Set<TeamSize>([1]),
  // Nines / Split Sixes: individuelt format, nøyaktig 3 spillere, team_size=1.
  // NinesSetup tar over som for Wolf/Nassau/Skins, så TeamSizeSelector vises
  // ikke i praksis — men type-system krever en entry.
  nines: new Set<TeamSize>([1]),
  // Round Robin: 4-spiller roterende-partner, team_size=1 (hver spiller er
  // sin egen row, team_number=rotation-slot trukket ved spillstart, #969).
  // Ingen lag-grid, så TeamSizeSelector vises ikke i praksis — men
  // type-system krever en entry.
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
  // Patsome er alltid lag à 2. PatsomeSetup vises i step 2.
  patsome: new Set<TeamSize>([2]),
};

type TeamSizeTileKey = 'solo' | 'par' | 'fourBBB' | 'tremannslag' | 'firemann';

type TileDef = {
  size: TeamSize;
  /** Translation key suffix within wizard.teamSize.* */
  key: TeamSizeTileKey;
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
  const enabled = ENABLED_COMBOS[mode];
  if (mode === 'florida_scramble') {
    const floridaTiles: TileDef[] = [
      { size: 3, key: 'tremannslag' },
      { size: 4, key: 'firemann' },
    ];
    return floridaTiles.filter((t) => enabled.has(t.size));
  }
  const teamTile: TileDef = isStablefordFamily(mode)
    ? { size: 2, key: 'fourBBB' }
    : { size: 2, key: 'par' };
  const candidates: TileDef[] = [
    { size: 1, key: 'solo' },
    teamTile,
    { size: 4, key: 'firemann' },
  ];
  return candidates.filter((t) => enabled.has(t.size));
}

/**
 * Lagstørrelse-velger — viser kun lagstørrelsene som faktisk gjelder valgt
 * modus (Solo / Par / 4BBB / 4-mann etter format). Formater som ikke kan
 * spilles i en gitt størrelse listes ikke, så velgeren viser aldri tomme
 * «kommer snart»-fliser for varianter som ikke gir mening (#478).
 *
 * Visuell konsistens: tile-stilen speiler `ModeSelector` (border, padding,
 * active-state via primary-soft + inset-ring) men droper ikon — per design-
 * dokumentet er lagstørrelse en sekundær parameter og fortjener ikke samme
 * symbolske vekting som modus-valget.
 */
const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

export function TeamSizeSelector({
  mode,
  value,
  onChange,
  disabled = false,
}: Props) {
  const t = useTranslations('wizard.teamSize');
  const tiles = tilesForMode(mode);

  return (
    <fieldset disabled={disabled}>
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('legend')}
      </legend>
      <div role="radiogroup" className={`mt-2 grid gap-3 ${GRID_COLS[tiles.length] ?? 'grid-cols-3'}`}>
        {tiles.map((tile) => {
          const selected = value === tile.size;
          const tileTitle = t(`${tile.key}.title` as Parameters<typeof t>[0]);
          return (
            <button
              key={tile.size}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={tileTitle}
              disabled={disabled}
              onClick={() => {
                if (!disabled) onChange(tile.size);
              }}
              className={`flex min-h-[44px] flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
                  : 'cursor-pointer border-border bg-surface text-text hover:bg-primary-soft/60'
              }`}
            >
              <span className="font-serif text-base leading-snug">
                {tileTitle}
              </span>
              <span className="font-sans text-[11px] leading-snug text-muted tabular-nums">
                {t(`${tile.key}.hint` as Parameters<typeof t>[0])}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
