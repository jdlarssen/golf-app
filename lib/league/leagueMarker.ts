/**
 * The marker in a simulator league (#2661). One home for who may be named and
 * who may approve (AGENTS.md trap 4):
 *
 *  - a simulator league asks for a marker when the card is delivered; a
 *    regular league does not, since the flight of two is the marker there
 *    (`minFlightPlayers` in `flightRules.ts`);
 *  - the marker is another member of the league, usually not in the flight:
 *    every player plays their own round in Tørny, also when several stand in
 *    the same simulator (the owner, 2026-10-27);
 *  - the named marker approves the card, or the league's organiser or a global
 *    admin in the marker's stead (the owner's answer 2026-10-27: «arrangøren
 *    kan godkjenne»). Never the card's owner, never the one who delivered it.
 *
 * Handing over (#2814, the owner 10.11): the one who keeps the flight's cards
 * delivers only their own, and becomes the marker for the cards they kept
 * (`fixedMarker`). The flightmate looks the card over and delivers it.
 * Unchanged since the marker kept it (`unchangedSinceMarker`), it is approved
 * on delivery; changed, it waits in the marker's queue. For their own card the
 * deliverer may pick a flightmate, who stands first in the picker
 * (`orderMarkerOptions`). A card the marker sends back goes back to the same
 * marker (`fixedMarker`).
 *
 * The server reads it at delivery (`setFlightMarkerCore`) and at approval
 * (`markerReviewAccess`, `scorecardReviewAccess`). The database holds the same
 * line for direct requests: only the service role and a global admin name the
 * marker or approve in a simulator-league flight (migration 0220).
 *
 * Imports nothing on purpose: the native app imports this file by relative path.
 */

/** True when a delivery in this league must name a marker. */
export function markerRequired(isSimulator: boolean): boolean {
  return isSimulator;
}

/** Why the server refuses the named marker. */
export type MarkerRefusal = 'marker_required' | 'marker_is_self' | 'marker_not_member';

/**
 * Who the deliverer can pick: every member of the league except the owners of
 * the cards in this delivery and the deliverer. A flightmate whose own card is
 * not in the delivery is a valid marker. In member order, each member once.
 */
export function markerCandidates(
  leagueMemberIds: readonly string[],
  cardOwnerIds: readonly string[],
  delivererId: string,
): string[] {
  const excluded = new Set([...cardOwnerIds, delivererId]);
  return Array.from(new Set(leagueMemberIds)).filter((id) => !excluded.has(id));
}

/**
 * The server's check of the named marker, or null when it passes. A missing
 * marker, the deliverer or a card owner (`marker_is_self`) and someone outside
 * the league (`marker_not_member`) each have their own code, so a hand-made
 * request gets the same answer as the form.
 */
export function markerRefusal(opts: {
  markerUserId: string | null | undefined;
  memberIds: readonly string[];
  cardOwnerIds: readonly string[];
  delivererId: string;
}): MarkerRefusal | null {
  const { markerUserId, memberIds, cardOwnerIds, delivererId } = opts;
  if (!markerUserId) return 'marker_required';
  if (markerUserId === delivererId || cardOwnerIds.includes(markerUserId)) return 'marker_is_self';
  if (!memberIds.includes(markerUserId)) return 'marker_not_member';
  return null;
}

/**
 * May `approverId` approve this card in a simulator-league flight? `marker`
 * for the named marker, `organizer` for the league's organiser or a global
 * admin in the marker's stead, null for everyone else: the owner, the one who
 * delivered it, a flightmate, another member. The role picks the wording of
 * the player's notice («Anders har godkjent» vs «arrangøren»).
 */
export function mayApproveAsMarker(opts: {
  approverId: string;
  markerUserId: string | null;
  ownerId: string;
  submittedBy: string | null;
  leagueCreatorId: string;
  approverIsAdmin: boolean;
}): 'marker' | 'organizer' | null {
  const { approverId, markerUserId, ownerId, submittedBy, leagueCreatorId, approverIsAdmin } = opts;
  if (approverId === ownerId || (submittedBy != null && approverId === submittedBy)) return null;
  if (markerUserId != null && approverId === markerUserId) return 'marker';
  if (approverId === leagueCreatorId || approverIsAdmin) return 'organizer';
  return null;
}

/** A `scores` row as these rules read it: who keyed it last. */
export type KeyedRow = { entered_by: string | null };

/**
 * True when `userId` keyed every row and there is at least one. The one home
 * for «kept by» (`flightDeliveryCandidates`) and «unchanged since the marker
 * kept it» (`unchangedSinceMarker`), so the two cannot drift apart (AGENTS.md
 * trap 4). RLS on `scores` stamps the writer in `entered_by`, so a flightmate
 * who keys a hole, even with the same strokes, owns that row from then on.
 */
export function enteredAllBy(rows: readonly KeyedRow[], userId: string): boolean {
  return rows.length > 0 && rows.every((row) => row.entered_by === userId);
}

/**
 * #2814: the flightmate delivers the card the marker kept for them. When the
 * marker still keyed every row, nothing was changed, and the card is approved
 * on delivery (the owner's answer 10.11: «godkjent hvis uendret»).
 */
export function unchangedSinceMarker(rows: readonly KeyedRow[], markerUserId: string): boolean {
  return enteredAllBy(rows, markerUserId);
}

/** The other active players in the flight game: `meId` and withdrawn players are not. */
export function activeFlightmates(
  roster: readonly { user_id: string; withdrawn_at: string | null }[],
  meId: string,
): string[] {
  return roster.filter((p) => p.user_id !== meId && p.withdrawn_at == null).map((p) => p.user_id);
}

/**
 * #2814 (the owner 10.11: «de jeg spilte med bør stå øverst»): the
 * flightmates first, then the rest of the league, each group by name.
 */
export function orderMarkerOptions<T extends { userId: string; name: string | null }>(
  options: readonly T[],
  flightMateIds: readonly string[],
): T[] {
  const mates = new Set(flightMateIds);
  const byName = (a: T, b: T) => (a.name ?? '').localeCompare(b.name ?? '', 'nb');
  return [
    ...options.filter((o) => mates.has(o.userId)).sort(byName),
    ...options.filter((o) => !mates.has(o.userId)).sort(byName),
  ];
}

/** The card fields the marker rules read (`game_players`). */
export type MarkerCard = {
  user_id: string;
  submitted_at: string | null;
  marker_user_id: string | null;
  rejection_reason: string | null;
  /** #2814: set by the server in the handover, cleared when a delivered card goes back (0233). */
  handed_over_at: string | null;
};

/**
 * Why a card's marker is fixed (#2814):
 *  - `handedOver`: a flightmate kept the card and handed it over (the server
 *    stamped `handed_over_at`). Delivered unchanged, it is approved in the
 *    marker's name (`unchangedSinceMarker`).
 *  - `returned`: the marker sent the card back (`rejection_reason`, cleared
 *    by the next delivery). The owner 11.11: «Ola må rette opp avvisningen og
 *    sende det inn til Per på nytt».
 *  - `assigned`: the card has a marker and neither, so it was reopened, or a
 *    delivery failed after the marker was named.
 * Only a handed-over card can be approved on delivery.
 */
export type FixedMarker = { reason: 'handedOver' | 'returned' | 'assigned'; markerUserId: string };

/**
 * The card's fixed marker, or null when the deliverer names one: the card is
 * delivered, has no marker, or names its owner. A fixed marker needs no
 * picker; one in the request is ignored. It is the same marker in or outside
 * the flight, so a rejection by a marker outside the flight also goes back to
 * them (this changes #2661, where the player picked a marker again).
 */
export function fixedMarker(card: MarkerCard): FixedMarker | null {
  const marker = card.marker_user_id;
  if (card.submitted_at != null || marker == null || marker === card.user_id) return null;
  if (card.handed_over_at != null) return { reason: 'handedOver', markerUserId: marker };
  if (card.rejection_reason != null) return { reason: 'returned', markerUserId: marker };
  return { reason: 'assigned', markerUserId: marker };
}

/**
 * #2712 (owner 31.10): a simulator league has one attempt per round. A
 * withdrawal frees the player for a new flight (`roundLocks`), so once the
 * card is delivered the player can no longer withdraw from the flight. Before
 * delivery, and in every other game, withdrawing stays as it was. The server
 * (`withdrawSelf`) refuses it; the web game home and the app hide the button.
 */
export function withdrawLockedByDelivery(opts: { simulatorFlight: boolean; submittedAt: string | null }): boolean {
  return opts.simulatorFlight && opts.submittedAt != null;
}
