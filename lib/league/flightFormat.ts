// Format-helpers for liga (#452 Fase 4). Mapper et liga-format til (a) hvilken
// games-flight som opprettes og (b) hvilken retning sesong-tabellen aggregeres.
//
// En liga-flight er en helt vanlig `games`-rad merket med runden den hører til.
// Stableford-flights rendrer det eksisterende stableford-scorekortet uendret —
// ligaen velger bare game_mode/mode_config ved opprettelse og scorer flighten
// med riktig modus i `getLigaSnapshot`.

import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { LeagueFormat } from './types';

/**
 * true når formatets per-runde-verdi er stableford-poeng (høyest best), false
 * for slagspill (mot-par, lavest best). Styrer `LeagueStandingsConfig.pointsBased`
 * og dermed retnings-logikken i `computeLeagueStandings` + display-formatering.
 */
export function isPointsBasedFormat(format: LeagueFormat): boolean {
  return format === 'stableford' || format === 'modified_stableford';
}

/** game_mode + mode_config for en flight i en liga med gitt format. */
export type LeagueFlightGameConfig = {
  gameMode: GameMode;
  modeConfig: GameModeConfig;
};

/**
 * Avgjør hvordan en liga-flight opprettes for et gitt format. Liga er alltid
 * individuell (solo, team_size 1). Stableford bruker standard-poeng-tabellen;
 * modifisert stableford bruker pro-tabellen — begge gjenbruker stableford-
 * scorekortet og -motoren uendret.
 */
export function leagueFlightGameConfig(format: LeagueFormat): LeagueFlightGameConfig {
  switch (format) {
    case 'stableford':
      return {
        gameMode: 'stableford',
        modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      };
    case 'modified_stableford':
      return {
        gameMode: 'modified_stableford',
        modeConfig: { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
      };
    case 'stroke':
      return {
        gameMode: 'solo_strokeplay',
        modeConfig: { kind: 'solo_strokeplay', team_size: 1 },
      };
  }
}
