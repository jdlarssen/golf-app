import type { CupSideAwardInput } from './computeCupLeaderboard';

/**
 * Sidepoeng-utfoldingen for en cup-snapshot (#1522, utdrag fra
 * `getCupSnapshot`). Ren funksjon over `tournament_side_awards`-radene —
 * to utganger fra samme pass, i radenes rekkefølge:
 *
 *  - `sideAwards` — visnings-innslagene panelet rendrer (#1441 D9, #1489).
 *  - `leaderboardInputs` — poeng-innslagene `computeCupLeaderboard` summerer.
 *
 * #1441 (D9): `winner_user_id` mappes til hvilket LAG spilleren tilhører via
 * rosteret — `winnerTeam: null` for uregistrert vinner (arrangøren har ikke
 * tastet ennå) OG for en vinner som ikke finnes i rosteret (defensivt — kan
 * ikke skje via `registerSideAwardWinner`s egen roster-validering, men laget
 * her tar ikke det for gitt).
 *
 * #1489: gir-rader foldes ut til ett leaderboard-innslag PER klarte GIR per
 * lag (poeng = teller × points, summert av motoren) — null-tellere
 * (uregistrert) og 0-tellere gir begge ingen innslag. ctp/ld-slot-rader får
 * `slotCount` = antall søsken med samme (kind, hull, points) for «1 av
 * 3»-nummereringen; gruppering per points slik at umulige DB-tilstander
 * (samme kind+hull med ulik points) vises som de ligger i stedet for å slå
 * sammen på tvers.
 */

export type CupSideAwardRow = {
  id: string;
  kind: string;
  hole_number: number;
  points: number;
  winner_user_id: string | null;
  no_winner: boolean;
  slot: number;
  gir_max_per_team: number | null;
  gir_team1_count: number | null;
  gir_team2_count: number | null;
};

/**
 * Ett sidepoeng-innslag (#1441 D9, #1489 slots + GIR) klart for visning.
 *
 * ctp/ld: én snapshot-rad PER VINNER-PLASS (slot-rad i DB). `slotCount` er
 * antall søsken-rader med samme (kind, hull, points) — panelet bruker den til
 * «1 av 3»-nummerering og viser ingen nummerering når den er 1 (gamle cuper).
 * `winnerTeam` er allerede utledet fra `winner_user_id` via rosteret (samme
 * mapping som mates inn i `computeCupLeaderboard`) — konsumenter slipper å
 * gjøre oppslaget selv. `null` inntil arrangøren taster vinneren.
 *
 * `noWinner` (#1530) skiller «arrangøren har svart: ingen vant» fra «ikke
 * tastet ennå» — begge har `winnerUserId`/`winnerTeam` null og gir 0 poeng,
 * men bare den første teller som registrert (`isSideAwardRegistered`).
 *
 * gir: én rad per hull med maks per lag og de to lag-tellerne — `null` teller
 * = ikke registrert ennå, `0` = eksplisitt registrert null GIR (begge gir 0
 * poeng; skillet er kun semantisk i panelet). Ingen spiller-attribusjon.
 */
export type CupSideAwardSnapshot =
  | {
      id: string;
      kind: 'ctp' | 'ld';
      holeNumber: number;
      points: number;
      slot: number;
      slotCount: number;
      winnerUserId: string | null;
      winnerTeam: 1 | 2 | null;
      noWinner: boolean;
    }
  | {
      id: string;
      kind: 'gir';
      holeNumber: number;
      points: number;
      maxPerTeam: number;
      team1Count: number | null;
      team2Count: number | null;
    };

/** Lag-tilhørighet slått opp fra rosteret (`getCupSnapshot` bygger settene). */
export type CupSideAwardTeams = {
  team1UserIds: ReadonlySet<string>;
  team2UserIds: ReadonlySet<string>;
};

export type CupSideAwardsResult = {
  sideAwards: CupSideAwardSnapshot[];
  leaderboardInputs: CupSideAwardInput[];
};

/**
 * Antall søsken-slots per (kind, hull, points) for ctp/ld. gir-rader har ingen
 * slots og telles ikke. Nøkkelen bruker rå `row.kind` — samme streng som
 * oppslaget i `buildCupSideAwards`, slik at en ukjent kind grupperes med sine
 * egne søsken i stedet for å lekke inn i ctp-bøtta.
 */
function countCtpLdSlots(rows: readonly CupSideAwardRow[]): Map<string, number> {
  const slotCountByKey = new Map<string, number>();
  for (const row of rows) {
    if (row.kind === 'gir') continue;
    const key = slotKey(row);
    slotCountByKey.set(key, (slotCountByKey.get(key) ?? 0) + 1);
  }
  return slotCountByKey;
}

function slotKey(row: CupSideAwardRow): string {
  return `${row.kind}#${row.hole_number}#${row.points}`;
}

function resolveWinnerTeam(
  winnerUserId: string | null,
  teams: CupSideAwardTeams,
): 1 | 2 | null {
  if (!winnerUserId) return null;
  if (teams.team1UserIds.has(winnerUserId)) return 1;
  if (teams.team2UserIds.has(winnerUserId)) return 2;
  return null;
}

/** Én gir-rad → dens visnings-innslag + ett leaderboard-innslag per klarte GIR. */
function girEntry(row: CupSideAwardRow): {
  snapshot: CupSideAwardSnapshot;
  leaderboardInputs: CupSideAwardInput[];
} {
  const team1Count = row.gir_team1_count;
  const team2Count = row.gir_team2_count;
  const leaderboardInputs: CupSideAwardInput[] = [];
  for (let i = 0; i < (team1Count ?? 0); i++) {
    leaderboardInputs.push({
      kind: 'gir',
      holeNumber: row.hole_number,
      points: row.points,
      winnerTeam: 1,
    });
  }
  for (let i = 0; i < (team2Count ?? 0); i++) {
    leaderboardInputs.push({
      kind: 'gir',
      holeNumber: row.hole_number,
      points: row.points,
      winnerTeam: 2,
    });
  }
  return {
    snapshot: {
      id: row.id,
      kind: 'gir',
      holeNumber: row.hole_number,
      points: row.points,
      maxPerTeam: row.gir_max_per_team ?? 1,
      team1Count,
      team2Count,
    },
    leaderboardInputs,
  };
}

export function buildCupSideAwards(
  rows: readonly CupSideAwardRow[],
  teams: CupSideAwardTeams,
): CupSideAwardsResult {
  const slotCountByKey = countCtpLdSlots(rows);

  const leaderboardInputs: CupSideAwardInput[] = [];
  const sideAwards: CupSideAwardSnapshot[] = [];

  for (const row of rows) {
    if (row.kind === 'gir') {
      const gir = girEntry(row);
      leaderboardInputs.push(...gir.leaderboardInputs);
      sideAwards.push(gir.snapshot);
      continue;
    }
    const kind: 'ctp' | 'ld' = row.kind === 'ld' ? 'ld' : 'ctp';
    const winnerTeam = resolveWinnerTeam(row.winner_user_id, teams);
    leaderboardInputs.push({
      kind,
      holeNumber: row.hole_number,
      points: row.points,
      winnerTeam,
    });
    sideAwards.push({
      id: row.id,
      kind,
      holeNumber: row.hole_number,
      points: row.points,
      slot: row.slot,
      slotCount: slotCountByKey.get(slotKey(row)) ?? 1,
      winnerUserId: row.winner_user_id,
      winnerTeam,
      // `?? false` holder eldre rader (og test-fixturer skrevet før 0157)
      // trygge: fravær av flagget betyr «ikke tastet ennå», ikke «ingen vant».
      noWinner: row.no_winner ?? false,
    });
  }

  return { sideAwards, leaderboardInputs };
}
