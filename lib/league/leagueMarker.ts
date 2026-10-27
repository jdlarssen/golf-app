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
