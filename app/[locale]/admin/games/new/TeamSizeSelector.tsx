'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';
import { selectableTeamSizes, teamSizeFit } from '@/lib/games/teamFormatLimits';
import { formatLineup } from '@/lib/wizard/formatLineup';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { FormSection } from '@/components/ui/FormSection';
import { choiceCardClass, ChoiceCardText, type ChoiceCardHeight } from '@/components/ui/ChoiceCard';
import { useLineupText } from './FormatLineup';

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
  /**
   * Flisenes minstehøyde. Artboardene tegner 72 px under kompis-runden (med
   * antallsvelgeren) og 64 px for klubb og solo (#2426).
   */
  tileHeight?: ChoiceCardHeight;
  /**
   * #2453: kompis-antallet. Satt → størrelsene som ikke går opp, står grå og
   * sier hvorfor (`teamSizeFit`), og linja for ett format med én størrelse
   * får oppstillingen. Utelatt (klubb, solo, utkast uten antall, GameForm) →
   * alle størrelsene kan velges som før.
   */
  playerCount?: number;
};

/**
 * Mapping fra modus til hvilke lagstørrelser formatet faktisk støtter, for
 * formatene utenfor scramble- og Stableford-familien. De to familiene leser
 * størrelsene fra `selectableTeamSizes` i `lib/games/teamFormatLimits.ts`
 * (#2453), der regelen for hvilke som går opp med antallet også bor.
 * `tilesForMode` viser kun disse — kombinasjoner som ikke gir mening (f.eks.
 * solo scramble) listes ikke i det hele tatt (#478, var tidligere grayed-out
 * «kommer snart»).
 *
 *  - Modus = Best ball → kun Par
 *
 * Singles matchplay (epic #45) krever team_size=1 (én spiller per side,
 * nøyaktig 2 sider). Scoring-motoren og payload-validatoren landet i
 * fase 1; ModeSelector og GameForm wires inn matchplay i fase 2.
 *
 * Solo strokeplay (epic #46) krever team_size=1 (én spiller = én rad).
 * Scoring-motoren og payload-validatoren landet i fase 1; ModeSelector
 * wires inn modusen i fase 2 — inntil da har modusen ingen UI-eksponering.
 *
 * Ved fremtidige moduser utvider vi denne mappen — ingen DB-migrasjon eller
 * payload-endring nødvendig før en konkret kombinasjon er implementert.
 */
/** The two families whose sizes live in `selectableTeamSizes` (#2453). */
type FamilyMode =
  | 'texas_scramble'
  | 'ambrose'
  | 'florida_scramble'
  | 'shamble'
  | 'stableford'
  | 'modified_stableford';

// Every other GameMode must be listed, so a new format without sizes fails in
// tsc instead of rendering an empty picker.
const ENABLED_COMBOS: Record<Exclude<GameMode, FamilyMode>, ReadonlySet<TeamSize>> = {
  best_ball: new Set<TeamSize>([2]),
  singles_matchplay: new Set<TeamSize>([1]),
  solo_strokeplay: new Set<TeamSize>([1]),
  fourball_matchplay: new Set<TeamSize>([2]),
  foursomes_matchplay: new Set<TeamSize>([2]),
  // Greensome matchplay (#289): alltid 2-mannslag (2 spillere per side).
  // TeamSizeSelector vises ikke for greensome i praksis (cup-only-format).
  greensome_matchplay: new Set<TeamSize>([2]),
  // Chapman (#290): 2v2 som foursomes. Cup-only — TeamSizeSelector vises ikke
  // i cup-match-wizarden.
  chapman_matchplay: new Set<TeamSize>([2]),
  // Gruesome (#291): 2v2 som foursomes. TeamSizeSelector vises ikke for
  // cup-only; standalone-path rendrer 2v2-grid direkte.
  gruesome_matchplay: new Set<TeamSize>([2]),
  // Wolf: hver av de 4 spillerne er sin egen «row» (team_size=1). Selve
  // team_number-feltet brukes som rotation-slot 1-4, ikke som lag-tildeling.
  // Veiviseren viser ikke TeamSizeSelector for wolf (WolfSetup tar over);
  // GameForm gjør, som linja «Solo».
  wolf: new Set<TeamSize>([1]),
  // Nassau: solo-format, 2-16 spillere (#460). TeamSizeSelector vises ikke for
  // nassau i veiviseren (NassauSetup tar over); GameForm viser linja «Solo».
  nassau: new Set<TeamSize>([1]),
  // Skins: solo-format, 2-16 spillere (#460). TeamSizeSelector vises ikke for skins
  // i veiviseren (SkinsSetup tar over); GameForm viser linja «Solo».
  skins: new Set<TeamSize>([1]),
  // Bingo Bango Bongo: individuelt format, 2–16 spillere (#460), team_size=1. En
  // dedikert BBB-setup-steg vil ta over som for Wolf/Nassau/Skins, så
  // TeamSizeSelector vises ikke i veiviseren; GameForm viser linja «Solo».
  bingo_bango_bongo: new Set<TeamSize>([1]),
  // Nines / Split Sixes: individuelt format, nøyaktig 3 spillere, team_size=1.
  // NinesSetup tar over som for Wolf/Nassau/Skins, så TeamSizeSelector vises
  // ikke i veiviseren; GameForm viser linja «Solo».
  nines: new Set<TeamSize>([1]),
  // Round Robin: 4-spiller roterende-partner, team_size=1 (hver spiller er
  // sin egen row, team_number=rotation-slot trukket ved spillstart, #969).
  // Ingen lag-grid, så TeamSizeSelector vises ikke i veiviseren; GameForm
  // viser linja «Solo».
  round_robin: new Set<TeamSize>([1]),
  // Acey Deucey: individuelt format, eksakt 4 spillere, team_size=1. En
  // dedikert setup-steg tar over (speiler Wolf/Skins/Nassau), så
  // TeamSizeSelector vises ikke i veiviseren; GameForm viser linja «Solo».
  acey_deucey: new Set<TeamSize>([1]),
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
 * Tile key for a size. Size 2 is mode-aware: in the Stableford family
 * team_size 2 IS 4BBB (best points per hole count), so it shows as «4BBB»
 * with an explaining hint instead of a cryptic «Par» (#282). Other team modes
 * (best ball, texas, fourball, foursomes) are not 4BBB and keep «Par».
 */
function tileKey(mode: GameMode, size: TeamSize): TeamSizeTileKey {
  if (size === 1) return 'solo';
  if (size === 2) return isStablefordFamily(mode) ? 'fourBBB' : 'par';
  return size === 3 ? 'tremannslag' : 'firemann';
}

/**
 * Tiles for a mode. The scramble and Stableford families read their sizes
 * from `selectableTeamSizes` (#2453): Texas/Ambrose 2, 3 and 4, Florida and
 * shamble 3 and 4 (no solo tile in the scramble family), Stableford solo and
 * 4BBB. Every other mode reads `ENABLED_COMBOS`.
 */
function tilesForMode(mode: GameMode): TileDef[] {
  const { sizes } = selectableTeamSizes(mode);
  // Empty outside the two families, and then the mode is one ENABLED_COMBOS lists.
  const enabled: readonly number[] =
    sizes.length > 0
      ? sizes
      : [...(ENABLED_COMBOS[mode as Exclude<GameMode, FamilyMode>] ?? [])].sort((a, b) => a - b);
  return enabled.map((size) => ({ size: size as TeamSize, key: tileKey(mode, size as TeamSize) }));
}

/**
 * Why a team size card is grey (#2453): «trenger 6» or «går ikke opp med
 * 10», read from `teamSizeFit`. `null` when the card can be picked; the
 * chosen card never is grey. `ShambleSetup` reads it too, so both pickers
 * say the same.
 */
export function useTeamSizeReason(): (
  mode: GameMode,
  size: number,
  count: number | null,
  selected: boolean,
) => string | null {
  const t = useTranslations('wizard.teamSize');
  return (mode, size, count, selected) => {
    if (selected) return null;
    const fit = teamSizeFit(mode, size, count);
    if (fit.kind === 'fits') return null;
    return fit.kind === 'needs'
      ? t('needs', { count: fit.players })
      : t('notWith', { count: fit.count });
  };
}

/**
 * Lagstørrelse-velger — viser kun lagstørrelsene som faktisk gjelder valgt
 * modus (Solo / Par / 4BBB / 4-mann etter format). Formater som ikke kan
 * spilles i en gitt størrelse listes ikke, så velgeren viser aldri tomme
 * «kommer snart»-fliser for varianter som ikke gir mening (#478).
 *
 * #2426: kickeren «VELG LAGSTØRRELSE» over valgkortene, rett på siden uten
 * kort rundt, som på artboardene. To fliser står to i bredden; tre fliser
 * (scramble) står tre i bredden med mindre tittel.
 *
 * #2453: med et kompis-antall følger velgeren antallet. Størrelsene som ikke
 * går opp, står grå, kan ikke velges og sier «trenger 6» eller «går ikke opp
 * med 10» (`teamSizeFit`). Det valgte kortet er aldri grått. Har formatet bare
 * én størrelse, er det ikke noe å velge: formatnavnet står over én linje,
 * «Lag à 2 · 2 mot 2».
 */
export function TeamSizeSelector({
  mode,
  value,
  onChange,
  disabled = false,
  tileHeight = 64,
  playerCount,
}: Props) {
  const t = useTranslations('wizard.teamSize');
  const tModes = useTranslations('modes');
  const lineupText = useLineupText();
  const reasonFor = useTeamSizeReason();
  const reasonIdPrefix = useId();
  const tiles = tilesForMode(mode);
  const cards = tiles.map((tile) => {
    const selected = value === tile.size;
    return { ...tile, selected, reason: reasonFor(mode, tile.size, playerCount ?? null, selected) };
  });
  // Radiogroup keyboard pattern: one tab stop, arrow keys move the choice and
  // pass over the sizes the count rules out.
  const rovingProps = useRovingFocus(
    cards.map((card) => card.size),
    value,
    (size) => {
      if (!disabled) onChange(size);
    },
    (size) => cards.some((card) => card.size === size && card.reason !== null),
  );

  if (tiles.length === 1) {
    const [only] = tiles;
    const size = t('line', { size: only.size });
    // One team (best ball with one pair) would only repeat the size: «Lag à 2».
    const lineup = playerCount === undefined ? null : formatLineup(mode, playerCount);
    const showLineup = lineup !== null && !(lineup.kind === 'teams' && lineup.teams === 1);
    return (
      <FormSection legend={tModes(mode as Parameters<typeof tModes>[0])}>
        <p data-testid="team-size-line" className="font-sans text-sm leading-[normal] text-text">
          {showLineup ? `${size} · ${lineupText(lineup)}` : size}
        </p>
      </FormSection>
    );
  }

  const layout = tiles.length >= 3 ? 'dense' : 'start';

  return (
    <FormSection legend={t('legend')} variant="bare" disabled={disabled}>
      <div
        role="radiogroup"
        className={`grid gap-2 ${tiles.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {cards.map((card, idx) => {
          const tileTitle = t(`${card.key}.title` as Parameters<typeof t>[0]);
          const unavailable = card.reason !== null;
          const reasonId = `${reasonIdPrefix}-${card.size}`;
          // The fade is the lock's (ChoiceCard): an unavailable card is
          // disabled, but only `disabled` fades it.
          const fade = unavailable && !disabled ? '' : 'disabled:opacity-50';
          return (
            <button
              key={card.size}
              {...rovingProps(idx)}
              type="button"
              role="radio"
              aria-checked={card.selected}
              aria-label={tileTitle}
              aria-describedby={unavailable ? reasonId : undefined}
              disabled={disabled || unavailable}
              onClick={() => {
                if (!disabled && !unavailable) onChange(card.size);
              }}
              className={`${choiceCardClass(card.selected, { height: tileHeight, layout, unavailable })} disabled:cursor-not-allowed ${fade}`}
            >
              <ChoiceCardText
                title={tileTitle}
                hint={
                  unavailable ? (
                    <span id={reasonId}>{card.reason}</span>
                  ) : (
                    t(`${card.key}.hint` as Parameters<typeof t>[0])
                  )
                }
                layout={layout}
                unavailable={unavailable}
              />
            </button>
          );
        })}
      </div>
    </FormSection>
  );
}
