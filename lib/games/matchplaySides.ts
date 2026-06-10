/**
 * Side-kapasitet og mangel-beregning for matchplay-familien (#544).
 *
 * Matchplay bruker team_number ∈ {1, 2} som side-discriminator —
 * flight_number = team_number (håndhevet av DB-CHECK
 * game_players_team_flight_consistency i migrasjon 0030). Kapasitet per
 * side bestemmes av mode_config.team_size:
 *   - singles_matchplay → team_size = 1 (1v1)
 *   - fourball/foursomes/greensome/chapman/gruesome → team_size = 2 (2v2)
 *
 * Trukkede spillere (withdrawn_at != null) teller aldri mot kapasitet.
 */

import type { GameMode } from '@/lib/scoring/modes/types';

/** De seks matchplay-modene som benytter side-konseptet. */
const MATCHPLAY_MODES = new Set<GameMode>([
  'singles_matchplay',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
]);

/**
 * True når `mode` er en av de seks matchplay-modene som krever
 * team_number ∈ {1, 2} per spiller. Brukes i action-validering,
 * autostart-vakt og side-velger.
 */
export function isMatchplayMode(mode: GameMode): boolean {
  return MATCHPLAY_MODES.has(mode);
}

export type RosterRow = {
  team_number: number | null;
  withdrawn_at: string | null;
};

/**
 * Beregn antall aktive (ikke-trukkede) spillere på hver side.
 * Returnerer `{ side1: number, side2: number }`.
 * Rader med team_number utenfor {1, 2} teller ikke mot noen side.
 */
export function countSidePlayers(roster: RosterRow[]): {
  side1: number;
  side2: number;
} {
  let side1 = 0;
  let side2 = 0;
  for (const row of roster) {
    if (row.withdrawn_at != null) continue;
    if (row.team_number === 1) side1++;
    else if (row.team_number === 2) side2++;
  }
  return { side1, side2 };
}

/**
 * Beregn mangel per side gitt nåværende roster og required `teamSize`.
 * Negativ mangel (overbooking) behandles som 0 — spillsiden er ansvarlig
 * for å forhindre overbooking via kapasitetssjekken.
 * Returnerer `null` dersom begge sider er fullbooket (0 mangel per side).
 */
export function computeSideShortfall(
  roster: RosterRow[],
  teamSize: number,
): { side1Needs: number; side2Needs: number } | null {
  const { side1, side2 } = countSidePlayers(roster);
  const side1Needs = Math.max(0, teamSize - side1);
  const side2Needs = Math.max(0, teamSize - side2);
  if (side1Needs === 0 && side2Needs === 0) return null;
  return { side1Needs, side2Needs };
}

/**
 * True dersom rosteret er komplett for å starte et matchplay-spill:
 *  - Eksakt `teamSize` ikke-trukkede spillere på side 1
 *  - Eksakt `teamSize` ikke-trukkede spillere på side 2
 *  - Ingen rader med team_number utenfor {1, 2} (null teller som utenfor)
 *
 * En underbooket side ELLER en null-rad blokkerer start.
 */
export function isSideRosterComplete(
  roster: RosterRow[],
  teamSize: number,
): boolean {
  // Check for any null/bad team_number among active players
  const hasInvalidSide = roster.some(
    (r) =>
      r.withdrawn_at == null &&
      r.team_number !== 1 &&
      r.team_number !== 2,
  );
  if (hasInvalidSide) return false;

  const { side1, side2 } = countSidePlayers(roster);
  return side1 === teamSize && side2 === teamSize;
}
