import type { GameMode } from '@/lib/scoring/modes/types';
import { finishedCupBlocksPlay } from '@/lib/cup/finishedCup';
import {
  readWithdrawalPlayOn,
  resolveCupMatchWithdrawal,
} from '@/lib/cup/cupWithdrawalOutcome';
import { getRatingForGender, type TeeBoxRatings, type TeeGender } from './teeRating';
import { isMatchplayMode, isSideRosterComplete } from './matchplaySides';
import { expectedTeamSize, needsTeamAssignment } from './teamScope';
import { needsFlightAssignment } from './flightScope';
import { startPlayerCountRange, type StartCountMode } from './startPlayerCount';
import type { StartBlockReason } from './startBlockReasons';

/**
 * Why a scheduled game cannot start (#2204). The start's guards, as one pure
 * function: `startScheduledGameCore` calls it before it writes anything, and
 * the game pages and the app call it to say why a round is stuck without
 * starting it.
 *
 * Import-pure on purpose (no `server-only`, no Next, no `Intl`/`crypto`): the
 * React Native app imports it by path, like the guard modules below.
 */

/** One `game_players` row, reduced to what the guards read. */
export type StartBlockRosterRow = {
  userId: string;
  teeGender: TeeGender;
  teamNumber: number | null;
  flightNumber: number | null;
  withdrawnAt: string | null;
  /**
   * The row's `users` row was read. The handicap freeze skips a row without
   * one (the FK should prevent it), so the rating check skips it too.
   */
  hasUser: boolean;
};

export type StartBlockInput = {
  gameMode: string;
  /** `games.mode_config`, raw. Read defensively by the guards. */
  modeConfig: unknown;
  teeBoxId: string | null;
  tee: TeeBoxRatings | null;
  tournamentId: string | null;
  /** The cup's status. `null` = not in a cup, or the caller cannot read it. */
  tournamentStatus: string | null;
  scheduledTeeOffAt: string | null;
  /** Every row, withdrawn ones included. */
  roster: StartBlockRosterRow[];
  /** Active players whose profile is not finished (`incomplete_profile_ids`). */
  pendingUserIds: string[];
};

export type StartBlock = {
  reason: StartBlockReason;
  /** #969 / #2071: set only for `rotation_player_count`. */
  rotationMode?: StartCountMode;
  rotationActiveCount?: number;
  /** #2207: set only for `pending_players`. Ids, never e-post. */
  pendingUserIds?: string[];
};

/**
 * The first guard the game fails, in the start's order, or `null` when it can
 * start.
 */
export function startBlockReason(input: StartBlockInput): StartBlock | null {
  const { roster, tournamentId } = input;
  const gameMode = input.gameMode as GameMode;

  // #2214: a finished cup stands, so no match in it starts. Before the tee
  // check on purpose: a match without a tee in a finished cup must give this
  // silent reason, not the structural 'tee_missing' that sends the organiser
  // «auto-start blokkert». It also runs before the withdrawal rule (#1814).
  // A null status means «unknown» and the start goes on as before.
  if (tournamentId && finishedCupBlocksPlay(input.tournamentStatus)) {
    return { reason: 'cup_finished' };
  }
  const tee = input.tee;
  if (!tee || !input.teeBoxId) return { reason: 'tee_missing' };
  if (roster.length === 0) return { reason: 'no_players' };

  // Lagstørrelsen begge lag-vaktene under klassifiserer på — samme helper og
  // samme fallback (1 = solo) som Lag-seksjonen og team-actionene, så «trenger
  // dette spillet lag?» har ett hjem (#1669).
  const teamSize = expectedTeamSize(input.modeConfig as { team_size?: number } | null);

  // #1814: en cup-kamp der noen har trukket seg kan alt være avgjort av
  // konvoluttregelen (halvert / walkover). Da skal den ALDRI starte — poengene
  // utledes av `withdrawn_at` mot tee-off, og kampen står `scheduled` for godt.
  // Sjekken kommer FØR side-vakta under, ellers ville den samme kampen meldt
  // 'incomplete_sides' og utløst «auto-start blokkert»-varselet til arrangøren
  // for noe hen selv bestemte.
  const playOn = readWithdrawalPlayOn(input.modeConfig);
  if (tournamentId) {
    const decided = resolveCupMatchWithdrawal({
      status: 'scheduled',
      gameMode: input.gameMode,
      scheduledTeeOffAt: input.scheduledTeeOffAt,
      playOn,
      players: roster
        .filter((r) => r.teamNumber === 1 || r.teamNumber === 2)
        .map((r) => ({
          userId: r.userId,
          side: r.teamNumber as 1 | 2,
          withdrawnAt: r.withdrawnAt,
        })),
    });
    if (decided) return { reason: 'decided_by_withdrawal' };
  }

  const rows = roster.map((r) => ({
    user_id: r.userId,
    team_number: r.teamNumber,
    flight_number: r.flightNumber,
    withdrawn_at: r.withdrawnAt,
  }));

  // Matchplay-familien krever eksakt team_size aktive spillere per side
  // (team_number ∈ {1, 2}). Spillere med null team_number eller trukkede
  // spillere blokkerer start. Alle seks matchplay-modi dekkes i ett.
  //
  // #1814: unntaket er en cup-fourball der arrangøren valgte at makkeren
  // spiller alene — da er én aktiv spiller på siden nok. Kom vi hit med det
  // flagget, sa regelen over nettopp at kampen SKAL spilles.
  if (isMatchplayMode(gameMode)) {
    const activeRows = rows.filter((r) => r.withdrawn_at == null);
    const allowSoloSide = playOn && input.gameMode === 'fourball_matchplay';
    if (!isSideRosterComplete(activeRows, teamSize, { allowSoloSide })) {
      return { reason: 'incomplete_sides' };
    }
  }

  // Lag-formater (best ball, scramble-familien, shamble, patsome,
  // par-stableford) må ha alle aktive spillere fordelt på lag før start.
  // Solo-selvpåmelding setter team_number = null, og scoring-computene hopper
  // stille over slike rader — uten denne vakta starter spillet og tavla er tom
  // (#1669). Matchplay dekkes av incomplete_sides over, solo-formater har
  // ingen lag: `needsTeamAssignment` returnerer false for begge.
  if (needsTeamAssignment(gameMode, teamSize, rows)) {
    return { reason: 'unassigned_teams' };
  }

  // Store solo-formater (>4 aktive, ikke wolf) må ha alle spillere fordelt i
  // flighter før start. Matchplay og lag-formater er aldri rammet (≤4 aktive,
  // eller flight = side/lag satt av validatorene).
  if (needsFlightAssignment(gameMode, rows)) {
    return { reason: 'unassigned_flights' };
  }

  // #969 / #2071: the active (non-withdrawn) roster size for every fixed-count
  // format, with the limits from `START_COUNT_RANGES` (#2222: publishing, the
  // wizard and the signup cap read the same numbers). A game with an optional
  // roster at publish (open signup, or a club tournament, #2433) is validated
  // as a draft and the signup cap only prevents "too many", so this really
  // catches "too few". Before the profile check: fail fast.
  const countRange = startPlayerCountRange(input.gameMode);
  if (countRange) {
    const n = roster.filter((r) => r.withdrawnAt == null).length;
    if (n < countRange.min || n > countRange.max) {
      return {
        reason: 'rotation_player_count',
        rotationMode: input.gameMode as StartCountMode,
        rotationActiveCount: n,
      };
    }
  }

  // #2441: an active player with an unfinished profile holds the round; the
  // handicap is needed from here on. The caller asks `incomplete_profile_ids`
  // about the active rows only.
  if (input.pendingUserIds.length > 0) {
    return { reason: 'pending_players', pendingUserIds: input.pendingUserIds };
  }

  // Every player needs a rating-set for their tee gender on the game's tee;
  // the start freezes the course handicap from it. Checked last, and before
  // anything is written: the start used to write the Wolf slots first (#2204).
  for (const r of roster) {
    if (!r.hasUser) continue;
    if (!getRatingForGender(tee, r.teeGender)) return { reason: 'tee_missing_rating' };
  }

  return null;
}
