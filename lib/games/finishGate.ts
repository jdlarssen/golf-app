// The finish gate: what must hold before a round can be finished, and who the
// finish screens list as missing (#2222). One home for every reader:
//
//  - the web core, `endGameCore` (the gate itself)
//  - the web finish surfaces: `/games/[id]/avslutt`, `/admin/games/[id]`,
//    `/admin/games/[id]/avslutt` and `/admin/games/[id]/avslutt-likevel`
//  - the app: `finishRound` (`native/app/src/data/endGame.ts`) and
//    `buildFinishPlan` (`native/app/src/lib/endGamePlan.ts`)
//
// The database enforces none of these checks (the only trigger on `games` is
// `guard_games_finish_pipeline_at`), so this file is the whole rule. Before
// #2222 it stood as a loop in `endGameCore`, a copy in the app kept in step by
// line pointers, and predicates on each page.
//
// The app imports this file by relative path, so it stays import-free: a new
// import here must also exist in `native/app/`, and only `expo export` catches
// it (#1901).
//
// A stamp counts as set when it is neither null nor undefined (`!= null`). For
// what a timestamp column can hold (null or an ISO string) that is the same as
// the truthiness checks the web used before, and a row read without the column
// behaves as it did.

/** The three stamps the gate reads, whatever the caller's row looks like. */
export interface FinishStamps {
  submittedAt: string | null;
  approvedAt: string | null;
  withdrawnAt: string | null;
}

/** Stamps from a `game_players` row as PostgREST returns it. */
export function stampsFromRow(row: {
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
}): FinishStamps {
  return {
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    withdrawnAt: row.withdrawn_at,
  };
}

/**
 * Is this row missing a peer approval?
 *
 * Both halves of the pair count. «Delivered, not approved» is the ordinary
 * case. «Approved, not delivered» cannot happen today — approving requires
 * `submitted_at`, and `reopenScorecard` clears both in one UPDATE — but it
 * blocks too, fail-closed, for a future path that clears only one of them.
 */
export function needsPeerApproval(
  submittedAt: string | null,
  approvedAt: string | null,
): boolean {
  const submitted = submittedAt != null;
  const approved = approvedAt != null;
  return (submitted && !approved) || (!submitted && approved);
}

/**
 * The roster as the finish screens show it, in roster order.
 *
 * Withdrawn players (WD, #386) are out of all three lists: they never miss a
 * delivery, never wait for an approval and are never a side-tournament winner
 * candidate (#2284; the winner half is also enforced by the database,
 * migration 0193).
 *
 *  - `active`: not withdrawn — the winner candidates.
 *  - `missing`: active and not delivered.
 *  - `unapproved`: active and {@link needsPeerApproval}; empty when the game
 *    does not require peer approval.
 *
 * Generic over the row, so each caller keeps its own columns.
 */
export function splitFinishRoster<T>(
  players: readonly T[],
  stamps: (player: T) => FinishStamps,
  requirePeerApproval: boolean,
): { active: T[]; missing: T[]; unapproved: T[] } {
  const active = players.filter((player) => stamps(player).withdrawnAt == null);
  const missing = active.filter((player) => stamps(player).submittedAt == null);
  const unapproved = requirePeerApproval
    ? active.filter((player) => {
        const { submittedAt, approvedAt } = stamps(player);
        return needsPeerApproval(submittedAt, approvedAt);
      })
    : [];
  return { active, missing, unapproved };
}

/**
 * Can the round be finished?
 *
 *  - An empty roster is `no_players`. The count is on raw rows, withdrawn
 *    included, so a round where everyone withdrew can be finished; the cup flow
 *    leans on that.
 *  - Withdrawn players never block.
 *  - A missing delivery blocks unless `allowMissing` («avslutt likevel», #375).
 *  - A missing peer approval blocks when the game requires it, and
 *    `allowMissing` never relaxes it.
 *  - The first blocking player in roster order decides the reason; `blocked`
 *    holds every player with that reason, so a screen can name them all at once.
 */
export function finishGate<T>(
  players: readonly T[],
  stamps: (player: T) => FinishStamps,
  opts: { requirePeerApproval: boolean; allowMissing: boolean },
):
  | { ok: true }
  | { ok: false; reason: 'no_players' }
  | { ok: false; reason: 'not_all_submitted' | 'not_all_approved'; blocked: T[] } {
  if (players.length === 0) return { ok: false, reason: 'no_players' };

  let reason: 'not_all_submitted' | 'not_all_approved' | null = null;
  const notSubmitted: T[] = [];
  const notApproved: T[] = [];

  for (const player of players) {
    const { submittedAt, approvedAt, withdrawnAt } = stamps(player);
    if (withdrawnAt != null) continue;

    if (submittedAt == null && !opts.allowMissing) {
      notSubmitted.push(player);
      reason ??= 'not_all_submitted';
    }
    if (opts.requirePeerApproval && needsPeerApproval(submittedAt, approvedAt)) {
      notApproved.push(player);
      reason ??= 'not_all_approved';
    }
  }

  if (reason === 'not_all_submitted') {
    return { ok: false, reason, blocked: notSubmitted };
  }
  if (reason === 'not_all_approved') {
    return { ok: false, reason, blocked: notApproved };
  }
  return { ok: true };
}
