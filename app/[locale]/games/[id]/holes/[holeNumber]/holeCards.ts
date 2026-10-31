// Rene avledninger over spillerkortene på hull-flaten (#1716 — ren flytting
// ut av `HoleClient`). Ingen hooks, ingen IO: gitt kortene + hvem jeg er,
// svarer disse på «hvilket kort er mitt» og «hvor mange mangler».

import type { HoleCard } from './holeLiveQueries';

/** Et sete er et spillerkort eller en rå spiller-rad — begge slås opp likt. */
type Seat = { userId: string; teamNumber?: number | null };

export type MySeatLookup = {
  /**
   * Team-collapsed moduser: `players` har én entry per lag (lag-kapteinen), så
   * oppslag via myUserId feiler for non-captain-medlemmer. Match på
   * teamNumber i stedet — players[0]-fallback var korrekt kun når rosteret
   * aldri spenner over mer enn ETT lag (dvs. ikke singleFlight med 2 lag),
   * så den falt til feil lag for en 4-spiller Texas/foursomes-runde (#1058).
   */
  isTeamCollapsedMode: boolean;
  myTeamNumber: number | null;
  myUserId: string;
};

/** Finn mitt sete blant kortene/spillerne. Se `MySeatLookup` for regelen. */
export function findMySeat<T extends Seat>(
  seats: T[],
  lookup: MySeatLookup,
): T | undefined {
  if (lookup.isTeamCollapsedMode) {
    return (
      seats.find((s) => s.teamNumber === lookup.myTeamNumber) ?? seats[0]
    );
  }
  return seats.find((s) => s.userId === lookup.myUserId);
}

/**
 * Har jeg (eller laget mitt) allerede levert scorekortet? Defensivt oppslag —
 * serveren redirecter allerede på submitted, dette er sikkerhetsnettet for
 * ikke-aktive tilstander nådd via stale klient-state.
 */
export function isMySeatSubmitted(
  players: Array<Seat & { submitted: boolean }>,
  lookup: MySeatLookup,
): boolean {
  return findMySeat(players, lookup)?.submitted ?? false;
}

/**
 * #2211: one home for «may this card be written to from here?». A card is
 * locked when the whole page is (round not active, or I have submitted), when
 * it belongs to a flight-mate who has submitted (the server freezes a
 * submitted card, so a typed number would never be stored), or when it is my
 * own card after I withdrew (#386). No admin exception (owner answer 2A): a
 * submitted card is reopened with «Åpne for redigering» on the players page.
 */
export function isCardLocked(
  card: Pick<HoleCard, 'userId' | 'submitted'>,
  ctx: { pageDisabled: boolean; withdrawn: boolean; myUserId: string },
): boolean {
  return (
    ctx.pageDisabled ||
    card.submitted ||
    (ctx.withdrawn && card.userId === ctx.myUserId)
  );
}

export type MyCardSummary = {
  myCard: HoleCard | undefined;
  myScoreEntered: boolean;
  /**
   * Antall ANDRE kort uten score på hullet. Mitt eget kort er ekskludert —
   * den tilstanden har sin egen affordance (den deaktiverte CTA-en). Et
   * levert kort telles heller ikke: det er låst, så hintet skal ikke be deg
   * fylle det (#2211).
   */
  missingFlightScoreCount: number;
};

/**
 * #1058: the CTA gates on MY OWN score (or my team's shared card in
 * team-collapsed modes), not on every card in the flight. Flight-mates who
 * haven't tapped in yet no longer block me from moving on — that's what
 * used to force a passive player's card to get filled by whoever else was
 * active. The "everyone still needs to enter something" signal moves to a
 * passive hint instead of gating the button.
 */
export function summarizeMyCard(
  cards: HoleCard[],
  lookup: MySeatLookup,
): MyCardSummary {
  const myCard = findMySeat(cards, lookup);
  return {
    myCard,
    myScoreEntered: myCard?.score != null,
    missingFlightScoreCount: cards.filter(
      (c) => c.userId !== myCard?.userId && !c.submitted && c.score == null,
    ).length,
  };
}
