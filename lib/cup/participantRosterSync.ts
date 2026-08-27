/**
 * Deltakerlista etter et spillerbytte (#1735).
 *
 * Pure — no I/O. `swapCupMatchPlayer` (lib/cup/actions.ts) writes the swap into
 * `game_players`, re-reads the two swapped players' rows across the cup's
 * matches, hands them in here, and performs the upsert/delete this returns.
 *
 * Why the sync exists at all: `tournament_participants` is what the Spillere
 * room lists and what the generate wizard reads as its ONLY player source. A
 * swap that only touched `game_players` left the withdrawn player on the list
 * and the reserve off it — the next generate round then rebuilt the cup from a
 * stale roster.
 *
 * The rule the table encodes: the participant list mirrors who actually stands
 * in the cup's matches. The reserve is enrolled because she now plays; the
 * withdrawn player is dropped only when she plays no match in the cup any more
 * (a split cup day, #1441 D3, can leave her standing in another bundle).
 */

export type ParticipantRosterSyncInput = {
  /** Spilleren som ble byttet UT av matchen. */
  outUserId: string;
  /** Reserven som ble byttet INN. */
  inUserId: string;
  /**
   * `game_players.user_id` for radene til de to byttede spillerne, på tvers av
   * cupens matcher, lest ETTER byttet. Kun `outUserId`/`inUserId` avgjør noe
   * under, så et bredere roster ville vært lest til ingen nytte (#1745).
   * Duplikater er greit (én rad per match). `null` = rosteret er ukjent
   * (lese-feilen slo til) — da fjernes ingen, jf. `removeParticipantId`.
   */
  rosterUserIds: string[] | null;
};

export type ParticipantRosterSyncPlan = {
  /**
   * Bruker som skal upsertes i `tournament_participants`, eller `null` når
   * ingen påmelding kan utledes. Allerede påmeldt = stille no-op på kallersiden
   * (`ignoreDuplicates`), så «meld på» er alltid trygt å gjenta.
   */
  addParticipantId: string | null;
  /**
   * Bruker hvis deltaker-rad skal slettes, eller `null` når raden skal bli
   * stående.
   */
  removeParticipantId: string | null;
};

export function planParticipantRosterSync(
  input: ParticipantRosterSyncInput,
): ParticipantRosterSyncPlan {
  const { outUserId, inUserId, rosterUserIds } = input;

  // Ukjent roster: reserven meldes likevel på (upserten er idempotent, og hun
  // ble nettopp skrevet inn i matchen), men INGEN slettes uten bevis for at
  // hun står utenfor — «ingen feil» er ikke det samme som «0 matcher» (I3).
  if (rosterUserIds === null) {
    return { addParticipantId: inUserId, removeParticipantId: null };
  }

  const roster = new Set(rosterUserIds);
  return {
    addParticipantId: roster.has(inUserId) ? inUserId : null,
    removeParticipantId: roster.has(outUserId) ? null : outUserId,
  };
}
