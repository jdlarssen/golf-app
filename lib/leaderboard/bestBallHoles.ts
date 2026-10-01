import type { LbPlayer, TeamLine } from '@/lib/leaderboard';
import { hasParDifference } from '@/lib/games/parDisplay';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { nameInitials } from '@/lib/names/initials';
import { teamLineVsPar, vsParOverPlayed } from './vsPar';

/**
 * «Hull for hull» for best ball (#2255 PR 3d): det webbens drilldown
 * (`holes/formats/drilldown.tsx`) regnet inne i visningen, samlet ett sted, så
 * webben og appen tegner samme lag med samme tall, rekkefølge og toner.
 *
 * Inn kommer `computeLeaderboard` sine `TeamLine`-er for hullene spillet
 * teller (segmentet, og i en aktiv runde bare første halvdel). Ut kommer ett
 * lag: plass, total, mot par, ut og inn med sum per ni, hull vunnet og
 * nabolagene for «forrige» og «neste».
 */

/** Webbens `--score-*`-trinn for et mot par-tall. */
export type VsParTone = 'under' | 'par' | 'over1' | 'over2';

export function vsParTone(vs: number): VsParTone {
  if (vs < 0) return 'under';
  if (vs === 0) return 'par';
  if (vs === 1) return 'over1';
  return 'over2';
}

export type BestBallCell = {
  userId: string;
  /** Fornavn og etternavn som initialer («KH»), «?» for en ukjent spiller. */
  initial: string;
  gross: number | null;
  /** Spillerens egen par (per kjønn), ikke lagets (#252). */
  par: number;
  grossText: string;
  netText: string;
  extraStrokes: number;
  /** Nettoen er lagets ball på hullet. */
  isBestNet: boolean;
  netVsPar: number | null;
  /** `null` når spilleren ikke har slag: da står «—» uten tone. */
  netTone: VsParTone | null;
};

export type BestBallHoleRow = {
  holeNumber: number;
  par: number;
  parByGender?: { mens: number; ladies: number; juniors: number };
  /** Hullet har en annen par for andre kjønn (stjerna ved «P4»). */
  parAside: boolean;
  teamNet: number | null;
  teamVsPar: number | null;
  teamTone: VsParTone | null;
  players: BestBallCell[];
};

export type BestBallNine = {
  key: 'front' | 'back';
  rows: BestBallHoleRow[];
  par: number;
  net: number;
  vsPar: number | null;
  /** Summen har alltid en tone; uten spilt hull er den pars (webbens `?? 0`). */
  tone: VsParTone;
};

export type BestBallTeamRef = { teamNumber: number; rank: number };

export type BestBallDrilldown = {
  teamNumber: number;
  rank: number;
  isLeader: boolean;
  total: number;
  totalVsPar: number | null;
  players: LbPlayer[];
  /** Ut (1–9) og inn (10–18), bare de nierne spillet har hull i. */
  nines: BestBallNine[];
  holesWon: number;
  prev: BestBallTeamRef | null;
  next: BestBallTeamRef | null;
  teamCount: number;
};

/**
 * Laget som vant hvert av `selected` sine hull alene, eller `null` ved delt
 * beste netto og uten score.
 */
export function bestBallHoleWinners(
  orderedLines: readonly TeamLine[],
  selected: TeamLine,
): Array<number | null> {
  return selected.holes.map((h) => {
    const eligible = orderedLines
      .map((l) => {
        const row = l.holes.find((r) => r.holeNumber === h.holeNumber);
        return row?.teamNet == null ? null : { teamNumber: l.teamNumber, net: row.teamNet };
      })
      .filter((x): x is { teamNumber: number; net: number } => x !== null);
    if (eligible.length === 0) return null;
    const min = Math.min(...eligible.map((e) => e.net));
    const winners = eligible.filter((e) => e.net === min);
    return winners.length === 1 ? winners[0]!.teamNumber : null;
  });
}

function holeRow(row: TeamLine['holes'][number], teamPlayers: readonly LbPlayer[]): BestBallHoleRow {
  const initialFor = new Map(teamPlayers.map((p) => [p.userId, nameInitials(p.name)]));
  const teamVsPar = row.teamNet == null ? null : row.teamNet - row.par;
  return {
    holeNumber: row.holeNumber,
    par: row.par,
    parByGender: row.parByGender,
    parAside: row.parByGender != null && hasParDifference(row.parByGender),
    teamNet: row.teamNet,
    teamVsPar,
    teamTone: teamVsPar == null ? null : vsParTone(teamVsPar),
    players: row.players.map((pc) => {
      const netVsPar = pc.net == null ? null : pc.net - pc.par;
      return {
        userId: pc.userId,
        initial: initialFor.get(pc.userId) ?? '?',
        gross: pc.gross,
        par: pc.par,
        grossText: pc.gross == null ? '–' : String(pc.gross),
        netText: pc.net == null ? '–' : String(pc.net),
        extraStrokes: pc.extraStrokes,
        isBestNet: pc.net !== null && row.teamNet !== null && pc.net === row.teamNet,
        netVsPar,
        netTone: netVsPar == null ? null : vsParTone(netVsPar),
      };
    }),
  };
}

function nine(
  key: BestBallNine['key'],
  rows: TeamLine['holes'],
  teamPlayers: readonly LbPlayer[],
): BestBallNine {
  const par = rows.reduce((sum, h) => sum + h.par, 0);
  const net = rows.reduce((sum, h) => sum + (h.teamNet ?? 0), 0);
  // #2217: niens egne rader. Et uspilt hulls par er ikke med, som i totalen.
  const vsPar = vsParOverPlayed({
    total: net,
    scopePar: par,
    unplayedPars: rows.filter((r) => r.teamNet == null).map((r) => r.par),
    holesInScope: rows.length,
  });
  return { key, rows: rows.map((r) => holeRow(r, teamPlayers)), par, net, vsPar, tone: vsParTone(vsPar ?? 0) };
}

/**
 * Laget «Hull for hull» viser: `requestedTeam`, eller lederen når det mangler
 * eller ikke finnes (en gammel lenke til et slettet lag lander likevel et
 * sted). `coursePar` er tavlas par (`par_mens`) over de samme hullene, så
 * mot par er det samme som på tavla (#2217). `null` uten lag.
 */
export function bestBallDrilldown(opts: {
  lines: readonly TeamLine[];
  requestedTeam: number | null;
  coursePar: number;
}): BestBallDrilldown | null {
  const { lines, requestedTeam, coursePar } = opts;
  // Plassen, så lagnummeret: fast rekkefølge uansett hvordan linjene kom inn.
  const ordered = [...lines].sort((a, b) => a.rank - b.rank || a.teamNumber - b.teamNumber);
  if (ordered.length === 0) return null;
  const selected =
    (requestedTeam != null ? ordered.find((l) => l.teamNumber === requestedTeam) : undefined) ?? ordered[0]!;
  const idx = ordered.indexOf(selected);
  const ref = (l: TeamLine | undefined): BestBallTeamRef | null =>
    l ? { teamNumber: l.teamNumber, rank: l.rank } : null;

  const front = selected.holes.filter((h) => h.holeNumber <= 9);
  const back = selected.holes.filter((h) => h.holeNumber >= 10);
  const nines: BestBallNine[] = [];
  // #1448: et spill på de ni siste har ingen ut-del, og omvendt.
  if (front.length > 0) nines.push(nine('front', front, selected.players));
  if (back.length > 0) nines.push(nine('back', back, selected.players));

  return {
    teamNumber: selected.teamNumber,
    rank: selected.rank,
    isLeader: selected.rank === 1,
    total: selected.total,
    totalVsPar: teamLineVsPar(selected, coursePar),
    players: selected.players,
    nines,
    holesWon: bestBallHoleWinners(ordered, selected).filter((w) => w === selected.teamNumber).length,
    prev: ref(ordered[idx - 1]),
    next: ref(ordered[idx + 1]),
    teamCount: ordered.length,
  };
}

/** Lagets navn i et avsluttet spill, som webben: «Ola "Kompis" N. · Kari H.». */
export function bestBallRevealMeta(players: readonly LbPlayer[]): string {
  return players.map((p) => formatRevealName(p.name, p.nickname)).join(' · ');
}
