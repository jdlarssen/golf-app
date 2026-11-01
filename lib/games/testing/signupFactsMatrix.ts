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

export const SIGNUP_FACTS_MATRIX_ROWS = 3 * 3 * 4 * 3 * 2 * 2 * 2 * 2 * 2 * 4 * 2;

/**
 * Every combination of the facts the signup rule reads (#2748, AK 36), for the
 * rule's own test and for the test that the writes agree with it.
 */
export function* signupFactsMatrix(): Generator<SignupFacts> {
  for (const registration_mode of MODES)
    for (const registration_type of TYPES)
      for (const game_mode of FORMATS)
        for (const status of STATUSES)
          for (const closed of BOOLS)
            for (const let_friends_skip_gate of BOOLS)
              for (const isClubMember of BOOLS)
                for (const viewerIsFriend of BOOLS)
                  for (const hasPendingInvitation of BOOLS)
                    for (const requestView of REQUESTS)
                      for (const isAlreadyRegistered of BOOLS)
                        yield {
                          game: {
                            status,
                            registration_mode,
                            registration_type,
                            game_mode,
                            signups_closed_at: closed ? '2026-11-01T10:00:00Z' : null,
                            let_friends_skip_gate,
                          },
                          isAlreadyRegistered,
                          requestView,
                          hasPendingInvitation,
                          isClubMember,
                          viewerIsFriend,
                        };
}
