// Whether a scorecard's sums show NETTO (#2829). One rule for the player's own
// card in the app and the card behind a cell in the league table, in the app
// and on the web.
//
// NETTO stands in every format, stableford too, next to POENG (#2385). Two
// cards leave it out: a blind round in progress, where it would give away what
// the round hides (#2219), and a card counted without handicap, a gross
// league's (#2638), where net is the gross again.
export function showsNetTotal({
  revealActive = false,
  axis = 'net',
}: {
  revealActive?: boolean;
  /** The axis the card is counted on; a player's own card is always net. */
  axis?: 'net' | 'gross';
}): boolean {
  return !revealActive && axis === 'net';
}
