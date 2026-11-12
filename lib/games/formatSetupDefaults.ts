/**
 * Defaults for the format setup in the create wizard, shared by the web
 * wizard (`useGameFormState`) and the app's wizard (#2753). One home, so the
 * two cannot start a format on different values (trap 4).
 */
import type { GameMode } from '@/lib/scoring/modes/types';
import { ambroseDefaultPct } from '@/lib/scoring/modes/ambrose';
import { defaultFloridaHandicapPct } from '@/lib/scoring/modes/floridaScramble';

/** The web's `TeamSize` (TeamSizeSelector.tsx), without the component import. */
export type FormatTeamSize = 1 | 2 | 3 | 4;

/**
 * Velger default-lagstørrelse for en gitt modus, alltid en av størrelsene
 * velgeren viser. Scramble- og Stableford-familien leser størrelsene fra
 * `selectableTeamSizes` (`lib/games/teamFormatLimits.ts`, #2453): Stableford
 * → 1 (solo), Texas/Ambrose → 4, Florida → 3, Shamble → 4. Resten leser
 * `TeamSizeSelector.ENABLED_COMBOS`: Best ball → 2, Singles matchplay → 1
 * (én spiller per side, men TeamSizeSelector er skjult for matchplay siden
 * det ikke finnes noen reell lagstørrelse å velge mellom), Solo strokeplay →
 * 1 (én spiller = én rad). Holdt synk separat fordi GameForm trenger en ren
 * funksjon for state-initialisering uten å eksponere selector-internt.
 */
export function defaultTeamSizeForMode(mode: GameMode): FormatTeamSize {
  if (mode === 'stableford') return 1;
  // Modified stableford (#281): solo som default, par valgbart via selector.
  if (mode === 'modified_stableford') return 1;
  if (mode === 'singles_matchplay') return 1;
  if (mode === 'solo_strokeplay') return 1;
  // Texas scramble: default 4-mannslag (typisk firma-cup-størrelse).
  // 2-mannslag valgbart via TeamSizeSelector.
  if (mode === 'texas_scramble') return 4;
  // Ambrose (#284): default 4-mannslag (mest vanlig i klubb-turneringer).
  // 2-mannslag valgbart via TeamSizeSelector.
  if (mode === 'ambrose') return 4;
  // Florida Scramble (#283): default 3-mannslag (step-aside-regelen er mest
  // naturlig med 3 spillere). 4-mannslag valgbart via TeamSizeSelector.
  if (mode === 'florida_scramble') return 3;
  // Wolf: hver spiller er sin egen «row». team_number 1..n (#465: n=3-5)
  // brukes som rotation-slot, ikke som lag-tildeling. team_size=1 betyr
  // requiresTeams=false så vi får solo-style player-selection i step 3.
  if (mode === 'wolf') return 1;
  // Nassau / Skins / Bingo Bango Bongo: solo-formater (ingen lag), 2-16
  // spillere (#460). team_size=1 betyr requiresTeams=false → orderedPayload tar
  // solo-stien og emitter de valgte spillerne med team/flight null. Uten
  // disse entry-ene falt de til default-2, requiresTeams ble true, og
  // orderedPayload endte tom → publish sendte 0 spillere.
  if (mode === 'nassau') return 1;
  if (mode === 'skins') return 1;
  if (mode === 'bingo_bango_bongo') return 1;
  // Nines / Split Sixes (#278): solo-format (ingen lag), team_size=1 betyr
  // requiresTeams=false så vi får solo-style player-selection i step 3.
  if (mode === 'nines') return 1;
  // Round Robin: 4 spillere, team_number 1-4 = rotation-slot (A/B/C/D).
  // team_size=1 som Wolf — ingen lag-grid, solo-style player-selection.
  if (mode === 'round_robin') return 1;
  // Acey Deucey: individuelt format, eksakt 4 spillere, team_size=1.
  if (mode === 'acey_deucey') return 1;
  // Shamble / Champagne Scramble: lag-format, default 4-mannslag (klassisk
  // shamble-størrelse). Admin kan endre til 3 via ShambleSetup.
  if (mode === 'shamble') return 4;
  // Patsome (#286): lag à 2, alltid 2-mannslag.
  if (mode === 'patsome') return 2;
  return 2;
}

/**
 * NGF-default for Texas-scramble-lag-handicap, prosent av summert spille-HCP.
 * Settes som default i GameForm når admin endrer lagstørrelse — admin kan
 * deretter justere fritt innenfor 0–100 % av lagets snitt (#2566).
 */
export function defaultTexasHandicapPct(teamSize: FormatTeamSize): number {
  if (teamSize === 2) return 25;
  // 3-mannslag (#2009): 15 % — samme verdi som NGF-tabellen gir Florida for
  // 3-mannslag, og den ligger mellom Texas' 25 % (2-mann) og 10 % (4-mann).
  if (teamSize === 3) return 15;
  if (teamSize === 4) return 10;
  return 25;
}

/**
 * The team handicap a scramble team starts on, as a percent of the SUM of the
 * course handicaps: the web's per-format defaults (NGF for Texas and Florida,
 * the Ambrose formula). `null` for formats without a team handicap.
 */
export function defaultTeamHandicapPct(mode: GameMode, teamSize: FormatTeamSize): number | null {
  if (mode === 'texas_scramble') return defaultTexasHandicapPct(teamSize);
  if (mode === 'ambrose') return ambroseDefaultPct(teamSize);
  if (mode === 'florida_scramble') return defaultFloridaHandicapPct(teamSize);
  return null;
}

/**
 * Shamble / Champagne Scramble (#285): the shamble preset, two scores count,
 * net. The validator falls back to the same values.
 */
export const DEFAULT_SHAMBLE_SETUP = {
  variant: 'shamble',
  count: 2,
  scoring: 'net',
} as const;
