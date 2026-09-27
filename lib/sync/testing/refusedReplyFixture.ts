/**
 * What `upsert_score_if_newer` answers when RLS refuses the write (#2211).
 *
 * Captured from torny-staging on 2026-09-27: a non-admin marker calls the RPC
 * for a flight-mate who has submitted. `scores update by flight` filters the
 * UPDATE to 0 rows, `returning … into` without STRICT leaves every OUT column
 * NULL, and PostgREST answers `error: null`. Shared by the web and app drain
 * tests so both assert against the real shape, not a guessed one.
 */
export const REFUSED_REPLY_FIXTURE = [
  {
    game_id: null,
    user_id: null,
    hole_number: null,
    strokes: null,
    putts: null,
    entered_by: null,
    client_updated_at: null,
    updated_at: null,
    was_applied: null,
  },
];
