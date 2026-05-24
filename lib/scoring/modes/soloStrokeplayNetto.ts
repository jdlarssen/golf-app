// Solo strokeplay netto (epic #46): klassisk slagspill med HCP-fordeling.
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

import { strokesForHole } from '../strokeAllocation';
import { rankTeams } from '../tiebreaker';
import type {
  ScoringContext,
  ScoringHole,
  SoloStrokeplayResult,
  SoloStrokeplayPlayerLine,
} from './types';

/**
 * Padding-konstant for unplayed-hull i tie-break-cascaden.
 *
 * For å unngå at en spiller som har spilt færre hull får et urettmessig
 * fortrinn i tie-break-cascaden (back-9 / back-6 / back-3 / hole-18), padder
 * vi unplayed-hull med et stort tall — slik at rankTeams ser dem som "verre
 * enn enhver realistisk netto-score". 999 er trygt: et hull med 999 netto-
 * slag dominerer alle realistiske tie-break-sammenligninger.
 *
 * Dette er en pragmatisk forenkling for v1. Det matematisk "korrekte" valget
 * ville vært å sammenligne kun spillere med samme `holesPlayed`, men det
 * komplisererer leaderboard-shape (separate ranking-grupper per hole-count)
 * uten å gi vesentlig bedre brukeropplevelse. Padding-strategien gir
 * intuitive resultater: en spiller som har spilt 18 hull med god total
 * rangerer foran en spiller som har spilt 9 hull med samme total (siden
 * sistnevnte har 9 × 999 unplayed-padding i back-9-summen).
 *
 * Ved sammenligning mellom to spillere som BEGGE har spilt færre enn 18 hull,
 * vil padding-strategien fortsatt være konsistent — begge får 999-padding
 * for unplayed-hull, og cascaden bryter på første hull hvor de differerer.
 */
const UNPLAYED_PADDING = 999;

interface PlayerHoleStrokes {
  userId: string;
  /** Netto-slag per hull, indeksert på `holeNumber - 1`. UNPLAYED_PADDING for unplayed. */
  perHoleNetForRanking: number[];
  /** Faktisk netto-slag for spilte hull (sum). */
  totalNetStrokes: number;
  /** Faktisk gross-slag for spilte hull (sum). */
  totalGrossStrokes: number;
  holesPlayed: number;
}

function computePlayerHoleStrokes(
  player: { userId: string; courseHandicap: number },
  holesSorted: ScoringHole[],
  grossByKey: Map<string, number | null>,
): PlayerHoleStrokes {
  const perHoleNetForRanking: number[] = [];
  let totalNetStrokes = 0;
  let totalGrossStrokes = 0;
  let holesPlayed = 0;

  for (const hole of holesSorted) {
    const gross = grossByKey.get(`${player.userId}#${hole.number}`) ?? null;
    if (gross === null) {
      // Ikke spilt — padding for ranking, ingen bidrag til total.
      perHoleNetForRanking.push(UNPLAYED_PADDING);
      continue;
    }
    const extra = strokesForHole(player.courseHandicap, hole.strokeIndex);
    const net = gross - extra;
    perHoleNetForRanking.push(net);
    totalNetStrokes += net;
    totalGrossStrokes += gross;
    holesPlayed += 1;
  }

  return {
    userId: player.userId,
    perHoleNetForRanking,
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
 * Beregner solo strokeplay netto-leaderboard fra en ScoringContext. Bruker
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
  const teamsForRanking = playerStrokes.map((p, i) => ({
    id: i,
    holes: padTo18(p.perHoleNetForRanking),
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
      rank: r.rank,
      tiedWith: tiedWithUserIds,
    };
  });

  return { kind: 'solo_strokeplay_netto', players };
}
