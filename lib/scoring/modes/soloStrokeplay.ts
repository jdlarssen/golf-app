// Solo strokeplay (epic #46): klassisk slagspill med HCP-fordeling.
//
// Hver spiller fører eget scorekort. Per hull: netto = gross − extra strokes
// (fra HCP-fordelingen i `strokeAllocation`). Total = sum av netto-slag for
// spilte hull. Lavest total vinner. Tie-break: 5-tier cascade fra
// `tiebreaker.rankTeams` på per-hull netto-arrays (ingen invertering — den
// helperen rangerer "lavest vinner" by default, som er nettopp det vi vil).
//
// Hull uten gross (pick-up / ikke spilt ennå) bidrar IKKE til totalen — vi
// teller dem som ikke spilte. Dette er bevisst: en spiller som har "pick-up"
// på et hull skal ikke få "0 slag" i totalen (det ville premiert dem urettmessig).
//
// #2253: games with `mode_config.ranking === 'net_to_par'` rank on net strokes
// against each player's OWN par over the holes they have played («thru»)
// instead. Games without the flag keep the rule above, byte for byte.
//
// #2940 F5: games stamped `countback: 'rulebook'` count a tie back on gross
// per hole minus one-half, one-third, one-sixth ... of the handicap
// (Committee Procedures 5A(6)(d)), not on net hole by hole. The total is the
// same either way.

import { strokesForHole } from '../strokeAllocation';
import { countsBackByRulebook, rankingHolesByNumber, rankTeams, ranksByNetToPar, UNPLAYED_PADDING } from '../tiebreaker';
import { parFor } from './parResolver';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  SoloStrokeplayHoleRow,
  SoloStrokeplayResult,
  SoloStrokeplayPlayerLine,
} from './types';

// UNPLAYED_PADDING (delt konstant i tiebreaker) padder uspilte hull i
// ranking-arrayet. Solo strokeplay padder ALLE uspilte hull, så en spiller
// som har spilt 18 hull rangerer foran en som har spilt færre ved ellers lik
// total — og en spiller uten skår havner sist. Se tiebreaker.ts for detaljer.

interface PlayerHoleStrokes {
  userId: string;
  /** Netto-slag per hull, i `holesSorted`-rekkefølge. UNPLAYED_PADDING for unplayed. */
  perHoleNetForRanking: number[];
  /** #2253: net − own par per hole in scope; `null` for an unplayed hole. */
  netToParByHole: { holeNumber: number; teamNet: number | null }[];
  /** #2940: gross per hole, in `holesSorted` order; `null` for an unplayed hole. */
  perHoleGross: (number | null)[];
  /** #2940: gross − own par per hole, in `holesSorted` order; `null` for an unplayed hole. */
  perHoleGrossToPar: (number | null)[];
  /** #2253: Σ net − own par over played holes; `null` when none is played. */
  netToPar: number | null;
  /** Faktisk netto-slag for spilte hull (sum). */
  totalNetStrokes: number;
  /** Faktisk gross-slag for spilte hull (sum). */
  totalGrossStrokes: number;
  holesPlayed: number;
}

function computePlayerHoleStrokes(
  player: ScoringPlayer,
  holesSorted: ScoringHole[],
  grossByKey: Map<string, number | null>,
): PlayerHoleStrokes {
  const perHoleNetForRanking: number[] = [];
  const netToParByHole: PlayerHoleStrokes['netToParByHole'] = [];
  const perHoleGross: (number | null)[] = [];
  const perHoleGrossToPar: (number | null)[] = [];
  let totalNetStrokes = 0;
  let totalGrossStrokes = 0;
  let netToPar = 0;
  let holesPlayed = 0;

  for (const hole of holesSorted) {
    const gross = grossByKey.get(`${player.userId}#${hole.number}`) ?? null;
    if (gross === null) {
      // Ikke spilt — padding for ranking, ingen bidrag til total.
      perHoleNetForRanking.push(UNPLAYED_PADDING);
      netToParByHole.push({ holeNumber: hole.number, teamNet: null });
      perHoleGross.push(null);
      perHoleGrossToPar.push(null);
      continue;
    }
    const extra = strokesForHole(player.courseHandicap, hole.strokeIndex);
    const net = gross - extra;
    const par = parFor(hole, player.teeGender);
    const toPar = net - par;
    perHoleNetForRanking.push(net);
    netToParByHole.push({ holeNumber: hole.number, teamNet: toPar });
    perHoleGross.push(gross);
    perHoleGrossToPar.push(gross - par);
    totalNetStrokes += net;
    totalGrossStrokes += gross;
    netToPar += toPar;
    holesPlayed += 1;
  }

  return {
    userId: player.userId,
    perHoleNetForRanking,
    netToParByHole,
    perHoleGross,
    perHoleGrossToPar,
    netToPar: holesPlayed > 0 ? netToPar : null,
    totalNetStrokes,
    totalGrossStrokes,
    holesPlayed,
  };
}

/**
 * Padder ranking-arrayet til 18 elementer med UNPLAYED_PADDING slik at
 * rankTeams sin back-9/back-6/back-3/hole-18-indeksering alltid har posisjoner
 * — også for 9-hulls-baner eller partial rounds. Padding-verdien er stor nok
 * til at unplayed-hull konsekvent rangeres "verre" enn spilte hull.
 */
function padTo18(perHoleNet: number[]): number[] {
  if (perHoleNet.length >= 18) return perHoleNet.slice(0, 18);
  return [
    ...perHoleNet,
    ...Array(18 - perHoleNet.length).fill(UNPLAYED_PADDING),
  ];
}

/**
 * #2940 F5: the per-hole scores `rankTeams` counts back on, in the slots of
 * the ranking array: by position (`padTo18`) in an older game, by hole number
 * (`rankingHolesByNumber`) in a net-to-par game, where they are gross − own
 * par so F5 and #2253 use the same unit. An unplayed hole, and a slot with no
 * hole, is `null`: no handicap is deducted on a step that holds one.
 */
function countbackHoles(
  p: PlayerHoleStrokes,
  holesSorted: ScoringHole[],
  netToParRanking: boolean,
): (number | null)[] {
  if (!netToParRanking) return Array.from({ length: 18 }, (_, i) => p.perHoleGross[i] ?? null);
  const byHoleNumber = new Map(holesSorted.map((h, i) => [h.number, p.perHoleGrossToPar[i]]));
  return Array.from({ length: 18 }, (_, i) => byHoleNumber.get(i + 1) ?? null);
}

/**
 * Bygger per-hull-radene som mater «Hull for hull»-flaten (epic #496, PR 8).
 * Til forskjell fra ranking-arrayet eksponeres `net`/`gross` som `null` på
 * uspilte hull (ikke 999-padding). `bestUserIds` = lavest netto blant de som
 * faktisk spilte hullet — tom hvis ingen, lengde > 1 ved delt. Ren funksjon av
 * samme `grossByKey` som rankingen.
 *
 * #2625: in a game ranked on net to par the hole is won on net against each
 * player's own par, the measure the game ranks on, so the hole cards agree
 * with the board on mixed tees.
 */
function computeHoleRows(
  holesSorted: ScoringHole[],
  players: ScoringPlayer[],
  grossByKey: Map<string, number | null>,
  netToParRanking: boolean,
): SoloStrokeplayHoleRow[] {
  return holesSorted.map((hole) => {
    const perPlayer = players.map((p) => {
      const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
      const net =
        gross === null
          ? null
          : gross - strokesForHole(p.courseHandicap, hole.strokeIndex);
      // #734: per-spiller par for riktig birdie/bogey-farge i UI.
      const par = parFor(hole, p.teeGender);
      return { userId: p.userId, gross, net, par, toPar: net === null ? null : net - par };
    });

    const played = perPlayer.filter(
      (c): c is { userId: string; gross: number; net: number; par: number; toPar: number } =>
        c.net !== null,
    );
    const measure = (c: { net: number; toPar: number }) => (netToParRanking ? c.toPar : c.net);
    let bestUserIds: string[] = [];
    if (played.length > 0) {
      const min = Math.min(...played.map(measure));
      bestUserIds = played.filter((c) => measure(c) === min).map((c) => c.userId);
    }

    return {
      holeNumber: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      // #734: eksponeres til UI slik at par-chip kan vise spillerens eget par.
      parByGender: hole.parByGender,
      perPlayer,
      bestUserIds,
    };
  });
}

/**
 * Beregner solo strokeplay-leaderboard fra en ScoringContext. Bruker
 * `strokesForHole` for HCP-allokering og `rankTeams` for 5-tier tie-break-
 * cascaden (lavest vinner). Returnerer én rad per spiller, sortert lavest
 * total-netto først.
 *
 * Ingen team-aggregering — hver spiller er sin egen «row». Spillere uten
 * registrerte scores får `totalNetStrokes: 0`, `holesPlayed: 0` og rank
 * basert på padding-strategien (deres ranking-array er fylt med
 * UNPLAYED_PADDING, så de rangerer bak alle spillere som faktisk har spilt).
 */
export function compute(ctx: ScoringContext): SoloStrokeplayResult {
  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const playerStrokes = ctx.players.map((p) =>
    computePlayerHoleStrokes(p, holesSorted, grossByKey),
  );

  // index-basert id slik at vi kan mappe tilbake til userId etter ranking.
  // #2253: a net-to-par game ranks on net − own par, slotted by hole number
  // (`rankingHolesByNumber`): an unplayed hole counts 0 («thru»), a hole
  // outside the segment counts 0, and a player without a single hole gets
  // UNPLAYED_PADDING and ranks last. Without the flag: today's rule.
  // #2940: a game stamped `countback: 'rulebook'` counts back with k/18 of
  // the handicap (F5) and goes on to holes 4-9, 7-9 and 9 (F4).
  const netToParRanking = ranksByNetToPar(ctx.game.mode_config);
  const rulebook = countsBackByRulebook(ctx.game.mode_config);
  const teamsForRanking = playerStrokes.map((p, i) => ({
    id: i,
    holes: netToParRanking
      ? rankingHolesByNumber(p.netToParByHole)
      : padTo18(p.perHoleNetForRanking),
    ...(rulebook
      ? {
          countback: {
            holes: countbackHoles(p, holesSorted, netToParRanking),
            courseHandicap: ctx.players[i].courseHandicap,
          },
        }
      : {}),
  }));

  const ranked = rankTeams(teamsForRanking, { rulebook });

  const players: SoloStrokeplayPlayerLine[] = ranked.map((r) => {
    const source = playerStrokes[r.id];
    const tiedWithUserIds = r.tiedWith.map((idx) => playerStrokes[idx].userId);
    return {
      userId: source.userId,
      totalNetStrokes: source.totalNetStrokes,
      totalGrossStrokes: source.totalGrossStrokes,
      holesPlayed: source.holesPlayed,
      netToPar: source.netToPar,
      rank: r.rank,
      tiedWith: tiedWithUserIds,
      decidedBy: r.decidedBy,
    };
  });

  const holes = computeHoleRows(holesSorted, ctx.players, grossByKey, netToParRanking);

  return {
    kind: 'solo_strokeplay',
    ranking: netToParRanking ? 'net_to_par' : 'net_total',
    players,
    holes,
  };
}
