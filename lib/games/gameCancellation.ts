// #2481: cancelling a scheduled round tells the players. Who hears it, which
// games cancel with a notice, and what the organiser's greeting may hold.
// Pure rules, no Supabase: both delete pages and `deleteGame` read the same
// answers (`gameCancellation.server.ts` loads the roster).

import type { GameStatus } from './status';
import { sortRoster } from './signupInbox';

/**
 * The longest greeting the organiser can send. One home: the textarea's
 * `maxLength`, the action's check and the `game_cancelled` payload schema all
 * read it.
 */
export const CANCEL_MESSAGE_MAX = 300;

export type CancellationRosterRow = {
  userId: string;
  /** `users.name`; `null` when the account has none (the page names them with the fallback). */
  name: string | null;
  isGuest: boolean;
  deletedAt: string | null;
  withdrawnAt: string | null;
};

/**
 * The players who get the notice: everyone on the list except the one who
 * cancels, guests (their placeholder address and devices reach no one, #1009),
 * anonymised accounts (#1012) and players who withdrew. In the roster's order
 * on the page (`sortRoster`).
 */
export function cancellationRecipients<T extends CancellationRosterRow>(
  rows: readonly T[],
  actorId: string,
): T[] {
  const told = rows.filter(
    (r) => r.userId !== actorId && !r.isGuest && r.deletedAt == null && r.withdrawnAt == null,
  );
  return sortRoster(told.map((row) => ({ userId: row.userId, displayName: row.name ?? '', row }))).map(
    (entry) => entry.row,
  );
}

/**
 * A scheduled round cancels with a notice. A draft is private to the
 * organiser, so no one needs telling; active and finished games keep the
 * plain delete page. Cup matches and league flights have flows of their own,
 * so they keep it too.
 */
export function canCancelWithNotice(game: {
  status: GameStatus;
  tournament_id: string | null;
  league_round_id: string | null;
}): boolean {
  return game.status === 'scheduled' && game.tournament_id == null && game.league_round_id == null;
}

export type CancelMessageResult =
  | { ok: true; message: string | undefined }
  | { ok: false; error: 'message_too_long' };

/**
 * The greeting from the form, trimmed. Empty is no greeting. Over
 * `CANCEL_MESSAGE_MAX` is an error, never cut short. A form posts a line break
 * as CRLF; it counts once, as the textarea's `maxLength` counted it.
 */
export function normalizeCancelMessage(raw: FormDataEntryValue | null | undefined): CancelMessageResult {
  if (typeof raw !== 'string') return { ok: true, message: undefined };
  const message = raw.replace(/\r\n?/g, '\n').trim();
  if (message === '') return { ok: true, message: undefined };
  if (message.length > CANCEL_MESSAGE_MAX) return { ok: false, error: 'message_too_long' };
  return { ok: true, message };
}
