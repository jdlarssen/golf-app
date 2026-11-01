import type { PendingRequestView } from '@/app/[locale]/signup/[shortId]/pendingRequestView';
import type { RegistrationMode, RegistrationType } from '@/lib/games/registration';
import type { SignupFacts } from '@/lib/games/signupOffer';
import type { GameMode } from '@/lib/scoring/modes/types';

const MODES: RegistrationMode[] = ['open', 'manual_approval', 'invite_only'];
const TYPES: RegistrationType[] = ['solo', 'both', 'team'];
/** No teams, teams, a side to pick, a player cap. */
const FORMATS: GameMode[] = ['stableford', 'best_ball', 'singles_matchplay', 'wolf'];
const STATUSES: SignupFacts['game']['status'][] = ['scheduled', 'active', 'finished'];
const REQUESTS: PendingRequestView[] = [
  'none',
  'self_request',
  'captain_invited',
  'team_awaiting_approval',
];
const BOOLS = [false, true];

const GAMES: SignupFacts['game'][] = MODES.flatMap((registration_mode) =>
  TYPES.flatMap((registration_type) =>
    FORMATS.flatMap((game_mode) =>
      STATUSES.flatMap((status) =>
        BOOLS.flatMap((closed) =>
          BOOLS.map((let_friends_skip_gate) => ({
            status,
            registration_mode,
            registration_type,
            game_mode,
            signups_closed_at: closed ? '2026-11-01T10:00:00Z' : null,
            let_friends_skip_gate,
          })),
        ),
      ),
    ),
  ),
);

const VIEWERS: Omit<SignupFacts, 'game'>[] = BOOLS.flatMap((isClubMember) =>
  BOOLS.flatMap((viewerIsFriend) =>
    BOOLS.flatMap((hasPendingInvitation) =>
      REQUESTS.flatMap((requestView) =>
        BOOLS.map((isAlreadyRegistered) => ({
          isAlreadyRegistered,
          requestView,
          hasPendingInvitation,
          isClubMember,
          viewerIsFriend,
        })),
      ),
    ),
  ),
);

export const SIGNUP_FACTS_MATRIX_ROWS = GAMES.length * VIEWERS.length;

/**
 * Every combination of the facts the signup rule reads (#2748, AK 36), for the
 * rule's own test and for the test that the writes agree with it.
 */
export function* signupFactsMatrix(): Generator<SignupFacts> {
  for (const game of GAMES) {
    for (const viewer of VIEWERS) yield { game, ...viewer };
  }
}
