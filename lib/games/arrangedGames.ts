/**
 * One home for «the games you arranged yourself» (#2489): a cup match or a
 * league flight is created by the organiser too, but it belongs on the cup's
 * or league's page, not in «Det du arrangerer» / «Spillene dine». Pass a
 * `games` query; it comes back with both links filtered to null.
 */
export function onlyStandaloneGames<
  Q extends { is(column: string, value: boolean | null): Q },
>(query: Q): Q {
  return query.is('tournament_id', null).is('league_round_id', null);
}
