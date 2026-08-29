// Rene avledninger over spillerkortene på hull-flaten (#1716 — ren flytting
// ut av `HoleClient`). Ingen hooks, ingen IO: gitt kortene + hvem jeg er,
// svarer disse på «hvilket kort er mitt», «hvor mange mangler», og
// stableford-poengene som vises live mens man taster.

import { computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import type { GameMode } from '@/lib/scoring/modes/types';
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

export type MyCardSummary = {
  myCard: HoleCard | undefined;
  myScoreEntered: boolean;
  /**
   * Antall ANDRE kort uten score på hullet. Mitt eget kort er ekskludert —
   * den tilstanden har sin egen affordance (den deaktiverte CTA-en).
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
      (c) => c.userId !== myCard?.userId && c.score == null,
    ).length,
  };
}

/** Modified stableford har egen poengtabell; resten bruker standardtabellen. */
export function stablefordPointsFnFor(
  gameMode: GameMode,
): typeof computeStablefordPoints {
  return gameMode === 'modified_stableford'
    ? computeModifiedStablefordPoints
    : computeStablefordPoints;
}

/**
 * Per-kort stableford-poeng for gjeldende hull. Vi regner client-side av
 * samme grunn som vi viser dem live (= umiddelbar feedback uten å vente på
 * neste server-render). Bruker spillerens egne extraStrokes som allerede er
 * bakt inn i ClientPlayer.
 */
export function stablefordPointsForCard(args: {
  card: HoleCard;
  par: number;
  gameMode: GameMode;
  isStableford: boolean;
}): number | null {
  const { card, par, gameMode, isStableford } = args;
  return isStableford && card.score != null
    ? stablefordPointsFnFor(gameMode)({
        par,
        netStrokes: card.score - card.extraStrokes,
      })
    : null;
}

/**
 * For stableford: regn ut «Dine poeng» live ved å justere server-totalen
 * med delta-en for current hull (server-snapshot vs live-Dexie-rad). Dette
 * gir umiddelbar feedback når brukeren taster et nytt slag — uten å vente
 * på neste server-render. For best-ball er hele blokken null.
 */
export function computeDisplayedStablefordTotal(args: {
  cards: HoleCard[];
  myUserId: string;
  par: number;
  gameMode: GameMode;
  isStableford: boolean;
  myStablefordTotal: number | null;
  myStablefordForCurrentHole: number | null;
}): number | null {
  const {
    cards,
    myUserId,
    par,
    gameMode,
    isStableford,
    myStablefordTotal,
    myStablefordForCurrentHole,
  } = args;
  if (!isStableford) return null;
  const myLiveCard = cards.find((c) => c.userId === myUserId);
  const myLiveScoreForCurrent = myLiveCard?.score ?? null;
  const myExtraStrokesForCurrent = myLiveCard?.extraStrokes ?? 0;
  const myLivePointsForCurrent =
    myLiveScoreForCurrent != null
      ? stablefordPointsFnFor(gameMode)({
          par,
          netStrokes: myLiveScoreForCurrent - myExtraStrokesForCurrent,
        })
      : null;
  return (
    (myStablefordTotal ?? 0) -
    (myStablefordForCurrentHole ?? 0) +
    (myLivePointsForCurrent ?? 0)
  );
}
