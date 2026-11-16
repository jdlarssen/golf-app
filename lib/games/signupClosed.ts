/**
 * #2482: whether the signup is closed, and why — the rule's one home. Closed
 * by hand («Steng påmeldingen», `signups_closed_at`, #543) or by the deadline
 * the organiser set (`signup_deadline`). The deadline needs no scheduled job:
 * it is checked here when someone tries, and again under the seat claim's lock
 * (`claim_open_registration_seat`, 0239, `now() >= signup_deadline`).
 *
 * Pure and import-free, so the signup page, the app's route, the lists and the
 * writes read the same answer.
 */

export type SignupClosedReason = 'manual' | 'deadline';

export type SignupClosure = { reason: SignupClosedReason; at: string };

type ClosableGame = {
  signups_closed_at?: string | null;
  signup_deadline?: string | null;
};

/**
 * Why and since when the signup is closed, or null while it is open. When both
 * have passed, the one that came first is the reason.
 */
export function signupClosure(game: ClosableGame, now: Date = new Date()): SignupClosure | null {
  const manual = game.signups_closed_at ?? null;
  const deadline = game.signup_deadline ?? null;
  const deadlinePassed = deadline != null && now.getTime() >= new Date(deadline).getTime();
  if (manual != null && (!deadlinePassed || new Date(manual).getTime() < new Date(deadline!).getTime())) {
    return { reason: 'manual', at: manual };
  }
  if (deadlinePassed) return { reason: 'deadline', at: deadline! };
  return null;
}

export function isSignupClosed(game: ClosableGame, now: Date = new Date()): boolean {
  return signupClosure(game, now) !== null;
}
