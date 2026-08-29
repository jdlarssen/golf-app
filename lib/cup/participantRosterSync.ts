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

import { exceedsPersonalPlayerCap } from './limits';

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

export type SwapParticipantCapInput = {
  /** `tournament_participants.user_id` for cupen, lest FØR byttet. */
  participantIds: string[];
  /** Spilleren som byttes UT av matchene som skrives. */
  outUserId: string;
  /** Reserven som byttes INN. */
  inUserId: string;
  /**
   * Står ut-spilleren igjen i en cup-match utenfor matchene som skrives
   * (splittet cup-dag, #1441)? Da beholder synken over deltaker-raden hennes.
   */
  outRemainsInCup: boolean;
  actorIsAdmin: boolean;
};

/**
 * Ville spillerbyttet sprengt deltaker-taket for en personlig cup (#1804)?
 *
 * Vakta bor i PLANFASEN av `swapCupMatchPlayer` — de tre andre skriveveiene
 * inn i `tournament_participants` håndhever taket allerede, og synken over er
 * best-effort med vilje (#1735) og kan ikke avvise. Kallersiden gater på
 * personlig ikke-admin-cup (som `addCupParticipant`); klubb-cuper er uncapped.
 *
 * Speiler `planParticipantRosterSync` sin semantikk for hva byttet gjør med
 * lista: reserven kommer inn, og ut-spillerens rad godskrives som fjernet KUN
 * når hun ikke står i noen cup-match etterpå. Akseptert rest-kant: godskriver
 * planfasen fjerningen, men roster-lesingen i synken feiler etterpå
 * (`removeParticipantId: null` mens reserven likevel meldes på), kan lista
 * unntaksvis lande én over taket. Taket selv (tall + sammenligning) bor i
 * `lib/cup/limits`.
 */
export function swapExceedsPersonalPlayerCap(
  input: SwapParticipantCapInput,
): boolean {
  const after = new Set(input.participantIds);
  after.add(input.inUserId);
  // Sletting av en som aldri sto på lista er en no-op — divergerte sett
  // (spiller i match uten deltaker-rad) gir da ingen falsk godskriving.
  if (!input.outRemainsInCup) after.delete(input.outUserId);
  return exceedsPersonalPlayerCap(after.size, input.actorIsAdmin);
}
