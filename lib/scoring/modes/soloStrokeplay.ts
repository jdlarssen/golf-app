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

import { strokesForHole } from '../strokeAllocation';
import { rankingHolesByNumber, rankTeams, UNPLAYED_PADDING } from '../tiebreaker';
import { parFor } from './parResolver';
import type {
  GameModeConfig,
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

/**
 * #2253: true when the game ranks on net-to-par (`mode_config.ranking`). The
 * one home for the question — the engine, the live board and the result
 * surfaces all ask it here, so they cannot disagree on a game's rule.
 */
export function ranksByNetToPar(modeConfig: GameModeConfig): boolean {
  return modeConfig.kind === 'solo_strokeplay' && modeConfig.ranking === 'net_to_par';
}

interface PlayerHoleStrokes {
  userId: string;
  /** Netto-slag per hull, i `holesSorted`-rekkefølge. UNPLAYED_PADDING for unplayed. */
  perHoleNetForRanking: number[];
  /** #2253: net − own par per hole in scope; `null` for an unplayed hole. */
  netToParByHole: { holeNumber: number; teamNet: number | null }[];
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
      continue;
    }
    const extra = strokesForHole(player.courseHandicap, hole.strokeIndex);
    const net = gross - extra;
    const toPar = net - parFor(hole, player.teeGender);
    perHoleNetForRanking.push(net);
    netToParByHole.push({ holeNumber: hole.number, teamNet: toPar });
    totalNetStrokes += net;
    totalGrossStrokes += gross;
    netToPar += toPar;
    holesPlayed += 1;
  }

  return {
    userId: player.userId,
    perHoleNetForRanking,
    netToParByHole,
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
 * Bygger per-hull-radene som mater «Hull for hull»-flaten (epic #496, PR 8).
 * Til forskjell fra ranking-arrayet eksponeres `net`/`gross` som `null` på
 * uspilte hull (ikke 999-padding). `bestUserIds` = lavest netto blant de som
 * faktisk spilte hullet — tom hvis ingen, lengde > 1 ved delt. Ren funksjon av
 * samme `grossByKey` som rankingen, så de kan aldri divergere.
 */
function computeHoleRows(
  holesSorted: ScoringHole[],
  players: ScoringPlayer[],
  grossByKey: Map<string, number | null>,
): SoloStrokeplayHoleRow[] {
  return holesSorted.map((hole) => {
    const perPlayer = players.map((p) => {
      const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
      const net =
        gross === null
          ? null
          : gross - strokesForHole(p.courseHandicap, hole.strokeIndex);
      // #734: per-spiller par for riktig birdie/bogey-farge i UI.
      return { userId: p.userId, gross, net, par: parFor(hole, p.teeGender) };
    });

    const played = perPlayer.filter(
      (c): c is { userId: string; gross: number; net: number; par: number } => c.net !== null,
    );
    let bestUserIds: string[] = [];
    if (played.length > 0) {
      const min = Math.min(...played.map((c) => c.net));
      bestUserIds = played.filter((c) => c.net === min).map((c) => c.userId);
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
  const netToParRanking = ranksByNetToPar(ctx.game.mode_config);
  const teamsForRanking = playerStrokes.map((p, i) => ({
    id: i,
    holes: netToParRanking
      ? rankingHolesByNumber(p.netToParByHole)
      : padTo18(p.perHoleNetForRanking),
  }));

  const ranked = rankTeams(teamsForRanking);

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
    };
  });

  const holes = computeHoleRows(holesSorted, ctx.players, grossByKey);

  return {
    kind: 'solo_strokeplay',
    ranking: netToParRanking ? 'net_to_par' : 'net_total',
    players,
    holes,
  };
}
