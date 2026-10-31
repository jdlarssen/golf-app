import type { GameMode } from '@/lib/scoring/modes/types';
import type { RegistrationType } from '@/lib/games/registration';
import { gameModeSupportsTeams } from '@/lib/games/registration';
import { isMatchplayMode } from '@/lib/games/matchplaySides';
import { resolveRegistrationTypeView } from '@/app/[locale]/signup/[shortId]/registrationTypeView';

// «Ta med en gjest» (#2607, fase 2): hvem som får raden på spillets side,
// siden `/games/[id]/ta-med-gjest` og handlingen bak den. Ett hjem for
// vilkårene, så raden aldri lover noe handlingen nekter (AGENTS.md felle 4).
//
// Eierens regel (18.10): en spiller kan bare melde på gjester når spilleren
// selv er påmeldt. Eierens svar 31.10: bare ved åpen påmelding og manuell
// godkjenning, ikke for direkte inviterte. Lagformatene tar med gjester
// gjennom lagpåmeldingen (fase 1). Databasen holder resten: vakttriggeren
// `guard_brought_guest` (0230) krever at verten står på lista og har høyst
// `BROUGHT_GUESTS_MAX` gjester.

/** Det porten leser om spillet. */
export type BringGuestGame = {
  status: string;
  created_by: string | null;
  game_mode: string;
  registration_mode: string;
  registration_type: string;
  signups_closed_at: string | null;
  tournament_id: string | null;
  league_round_id: string | null;
};

/** Det porten leser om spilleren. `seat: null` = ikke på lista. */
export type BringGuestPlayer = {
  userId: string;
  seat: { withdrawn_at: string | null } | null;
  isGuest: boolean;
};

/** Hvorfor spilleren ikke kan ta med en gjest her. Koden er handlingens feilkode. */
export type BringGuestBlock =
  | 'not_on_roster'
  | 'withdrawn'
  | 'is_guest'
  | 'is_organiser'
  | 'game_locked'
  | 'wrong_mode'
  | 'signup_closed'
  | 'cup'
  | 'league'
  | 'matchplay'
  | 'team_format';

/** `null` = spilleren kan ta med en gjest (taket sjekkes i databasen). */
export function bringGuestBlock(game: BringGuestGame, player: BringGuestPlayer): BringGuestBlock | null {
  if (!player.seat) return 'not_on_roster';
  if (player.seat.withdrawn_at != null) return 'withdrawn';
  if (player.isGuest) return 'is_guest';
  // Arrangøren legger til gjester under «Styr spillere».
  if (game.created_by === player.userId) return 'is_organiser';
  if (game.status !== 'scheduled') return 'game_locked';
  if (game.registration_mode !== 'open' && game.registration_mode !== 'manual_approval') {
    return 'wrong_mode';
  }
  if (game.signups_closed_at != null) return 'signup_closed';
  if (game.tournament_id != null) return 'cup';
  if (game.league_round_id != null) return 'league';
  const mode = game.game_mode as GameMode;
  if (isMatchplayMode(mode)) return 'matchplay';
  // The signup page's own gate (#1792): only where it shows the solo form.
  if (
    resolveRegistrationTypeView(game.registration_type as RegistrationType, gameModeSupportsTeams(mode))
      .kind !== 'solo_form'
  ) {
    return 'team_format';
  }
  return null;
}
