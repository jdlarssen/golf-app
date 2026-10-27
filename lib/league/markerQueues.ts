/**
 * #2661: the cards in a simulator league that wait for an answer, as the
 * league page lists them at the top. One home for the rule, read by the
 * web's league page and the app's (AGENTS.md trap 4):
 *
 *  - the marker sees the cards that name them («Venter på deg som markør»);
 *  - the league's organiser sees every other waiting card («Venter på
 *    markøren»), since they may approve in the marker's stead, but never a
 *    card they own or delivered: only its marker answers that one
 *    (`mayApproveAsMarker`, which the marker page's gate asks).
 *
 * Imports nothing on purpose: the native app imports this file by relative path.
 */

export type AwaitingMarkerCard = {
  gameId: string;
  userId: string;
  markerUserId: string;
  /** Who delivered the card, or null when unknown. */
  submittedBy: string | null;
};

export type QueuedCard = AwaitingMarkerCard & { roundLabel: string };

export function markerQueues(
  rounds: ReadonlyArray<{ label: string; awaitingMarker: readonly AwaitingMarkerCard[] }>,
  viewerId: string | null,
  viewerIsOrganizer: boolean,
): { forMarker: QueuedCard[]; forOrganizer: QueuedCard[] } {
  if (viewerId === null) return { forMarker: [], forOrganizer: [] };
  const waiting = rounds.flatMap((r) => r.awaitingMarker.map((card) => ({ ...card, roundLabel: r.label })));
  return {
    forMarker: waiting.filter((card) => card.markerUserId === viewerId),
    forOrganizer: viewerIsOrganizer
      ? waiting.filter(
          (card) =>
            card.markerUserId !== viewerId && card.userId !== viewerId && card.submittedBy !== viewerId,
        )
      : [],
  };
}
