// #2204: hvorfor en planlagt runde ikke starter, slik appens venterom ser det.
//
// Serveren og appen spør samme regel: `startBlockReason`
// (`lib/games/startBlockReason.ts`), som starten selv kjører før den skriver.
// Her bygges inputen fra bundelen spill-hjem alt har, og de uferdige profilene
// hentes med `incomplete_profile_ids` (SECURITY DEFINER, gitt til
// `authenticated`, 0185) med appens egen klient. Bare lesing.
//
// To ting appen ikke vet like godt som serveren, og det er akseptert:
// - Cupens status står ikke i bundelen (`tournamentStatus: null` = ukjent, som
//   i kjernen), så en kamp i en avsluttet cup gir ingen sperre her.
// - `hasUser` er alltid sann. Bundelen slår `users`-embeden sammen til
//   navn/kallenavn og kan ikke skille «RLS skjulte raden» fra «ingen bruker».
//   FK-en garanterer brukerraden, og serveren leser med service-rolle, der
//   embeden aldri mangler. Da gir begge samme `tee_missing_rating`.
//
// Kaster aldri. Feil eller offline gir `undefined` («ukjent»), ikke `null`
// («ingen sperre»): venterommet beholder da forrige svar i stedet for å vippe
// tilbake til «Starter snart» fordi ett kall feilet.
import { startBlockReason, type StartBlockInput } from '../../../../lib/games/startBlockReason';
import { STRUCTURAL_BLOCK_REASONS } from '../../../../lib/games/startBlockReasons';
import {
  isPlayOnChoicePending,
  readWithdrawalPlayOn,
  type CupWithdrawalInput,
} from '../../../../lib/cup/cupWithdrawalOutcome';
import type { TeeBoxRatings, TeeGender } from '../../../../lib/games/teeRating';
import type { WaitingRoomBlock } from '../lib/waitingRoom';
import { supabase } from '../supabase';
import type { BundleTeeRatings, GameBundle } from './gameBundle';

/** Bundelens camelCase-rating til kjernens snake_case. Lengden er ikke med. */
function toTeeBoxRatings(tee: BundleTeeRatings | null | undefined): TeeBoxRatings | null {
  if (!tee) return null;
  return {
    slope_mens: tee.slopeMens,
    course_rating_mens: tee.courseRatingMens,
    par_total_mens: tee.parTotalMens,
    slope_ladies: tee.slopeLadies,
    course_rating_ladies: tee.courseRatingLadies,
    par_total_ladies: tee.parTotalLadies,
    slope_juniors: tee.slopeJuniors,
    course_rating_juniors: tee.courseRatingJuniors,
    par_total_juniors: tee.parTotalJuniors,
  };
}

/** Bundelen som `startBlockReason`-input. Ren, så testen kan låse den. */
export function startBlockInput(bundle: GameBundle, pendingUserIds: string[]): StartBlockInput {
  const { game } = bundle;
  return {
    gameMode: game.gameMode,
    modeConfig: game.modeConfig,
    teeBoxId: game.teeBoxId,
    tee: toTeeBoxRatings(bundle.teeRatings),
    tournamentId: game.tournamentId,
    tournamentStatus: null,
    scheduledTeeOffAt: game.scheduledTeeOffAt,
    roster: bundle.players.map((p) => ({
      userId: p.userId,
      teeGender: p.teeGender as TeeGender,
      teamNumber: p.teamNumber,
      flightNumber: p.flightNumber,
      withdrawnAt: p.withdrawnAt,
      hasUser: true,
    })),
    pendingUserIds,
  };
}

/**
 * Venter cup-kampen på arrangørens valg om makkeren spiller alene (#1967)?
 * Kjernen svarer `decided_by_withdrawal` også da, men kampen kan bli spilt.
 * Samme bygging som `lib/cup/cupWaitingRoomWithdrawalState.ts`. Webben krever
 * i tillegg at cupen er i gang; bundelen har ikke cup-status.
 */
function playOnChoicePending(bundle: GameBundle): boolean {
  const { game } = bundle;
  const input: CupWithdrawalInput = {
    status: game.status as CupWithdrawalInput['status'],
    gameMode: game.gameMode,
    scheduledTeeOffAt: game.scheduledTeeOffAt,
    playOn: readWithdrawalPlayOn(game.modeConfig),
    players: bundle.players
      .filter((p) => p.teamNumber === 1 || p.teamNumber === 2)
      .map((p) => ({ userId: p.userId, side: p.teamNumber as 1 | 2, withdrawnAt: p.withdrawnAt })),
  };
  return isPlayOnChoicePending(input, game.modeConfig);
}

/**
 * Hva venterommet skal si om sperren. `null` = ingen sperre. `undefined` =
 * ukjent (feil eller offline), og da står forrige svar.
 */
export async function fetchStartBlock(
  bundle: GameBundle,
): Promise<WaitingRoomBlock | undefined> {
  try {
    const activeIds = bundle.players.filter((p) => p.withdrawnAt == null).map((p) => p.userId);
    let pendingUserIds: string[] = [];
    if (activeIds.length > 0) {
      const { data, error } = await supabase.rpc('incomplete_profile_ids', {
        p_user_ids: activeIds,
      });
      if (error || !data) return undefined;
      pendingUserIds = (data as { id: string }[]).map((row) => row.id);
    }
    const block = startBlockReason(startBlockInput(bundle, pendingUserIds));
    if (!block) return null;
    if (STRUCTURAL_BLOCK_REASONS.has(block.reason)) return 'structural';
    if (block.reason === 'decided_by_withdrawal') {
      return playOnChoicePending(bundle) ? 'structural' : 'will_not_play';
    }
    return null;
  } catch {
    return undefined;
  }
}
