/**
 * Machine sentinel stored in `game_players.rejection_reason` when an attestant
 * rejects a scorecard without writing a reason (#1364).
 *
 * Why a sentinel and not `null`: the rejection banner on game home is gated on
 * `rejection_reason` being truthy, and there is no other "was rejected" marker
 * on the row — `rejectScorecard` clears `submitted_at`/`approved_at`, so a
 * reason-less rejection with `null` here would be byte-identical to "never
 * submitted" and the banner would silently disappear. Storing a machine value
 * instead of Norwegian prose keeps the row locale-agnostic: the render side
 * swaps it for a catalog string in the reader's locale.
 *
 * Rows written before #1364 hold the literal text «Ingen grunn oppgitt» and
 * still render verbatim — no data migration.
 */
export const NO_REJECTION_REASON = '__no_reason__';
