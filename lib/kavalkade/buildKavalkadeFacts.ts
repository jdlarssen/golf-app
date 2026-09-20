/**
 * Fakta-byggeren for Kavalkaden (#2127, epic #1040).
 *
 * Samme prinsipp som runde-rapporten (#1008): en **ren** funksjon regner ut hvert
 * eneste tall som havner på kortene, og språkmodellen (K2) får bare denne
 * JSON-en. Modellen regner aldri selv, og ser aldri rå scorer — da kan den heller
 * ikke dikte opp en birdie som ikke ble slått.
 *
 * Tre regler styrer hva som teller med:
 *
 *  1. **Året** bøttes på Oslo-kalender via `effectiveYear` (planlagt utslag, ellers
 *     avslutning) — samme regel som «Mine tall» og sesong-recapen, ett hjem.
 *  2. **Frysegrensen:** bare spill avsluttet FØR `KAVALKADE_CUTOFF` teller. En runde
 *     som ble ferdig på selveste julaften kommer ikke med, uansett når kavalkaden
 *     åpnes.
 *  3. **Terskelen:** personlige kort krever 3 ferdige runder i året. Under det får
 *     spilleren bare gjengens kavalkade (eierens beslutning 2026-09-16).
 *
 * Brutto-disiplinen følger resten av huben: snitt, beste runde og oppgjørsmarginer
 * regnes KUN over komplette 18-hulls-runder, mens antall runder teller alle ferdige.
 * Bragder (birdie/snowman) og nemesis-hullet regnes per hull mot kjønns-par, så de
 * er uavhengige av modus og av om runden var komplett.
 *
 * Ren og I/O-fri (Type A, jf. `lib/scoring/AGENTS.md`). Lasteren
 * (`loadKavalkadeInput.ts`) eier all databasekontakt.
 */
import { computeRoundScore } from '@/lib/games/roundScore';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { countRoundAchievements, type HoleScore } from '@/lib/stats/achievements';
import { isWinningSummary } from '@/lib/stats/clubStats';
import {
  computeSeasonStats,
  type SeasonRoundInput,
  type SeasonSummary,
} from '@/lib/stats/seasonStats';
import {
  summarizeTrendRounds,
  type TrendRound,
  type TrendSummary,
} from '@/lib/stats/scoringTrend';

/** En komplett 18-hulls-runde — samme grense som «Mine tall» og formkurven. */
const COMPLETE_ROUND_HOLES = 18;

/** Ferdige runder som kreves for en personlig kavalkade (eieren, 2026-09-16). */
export const KAVALKADE_ROUNDS_NEEDED = 3;

/** Minste antall spilte ganger før et hull kan kalles nemesis. */
const NEMESIS_MIN_PLAYED = 3;

/** Antall runder i formtopp-vinduet. */
const FORM_PEAK_WINDOW = 3;

// ---------------------------------------------------------------------------
// Inn
// ---------------------------------------------------------------------------

/** Én spillers deltakelse i én ferdig runde, slik lasteren leverer den. */
export type KavalkadePlayerRound = {
  userId: string;
  name: string | null;
  /** `withdrawn_at` — satt ⇒ spilleren trakk seg og utelates helt. */
  withdrawnAt: string | null;
  /** Lagret, modus-riktig utfall (#572). `null` ⇒ spillet teller ikke som seier. */
  resultSummary: ResultSummary | null;
  /** Slagene spilleren fikk, for netto. `null` ⇒ netto ukjent for runden. */
  courseHandicap: number | null;
  /** Hull-for-hull med kjønns-valgt par. Tomt når scorer mangler. */
  holes: HoleScore[];
};

/** Én ferdig runde med alle spillerne sine. */
export type KavalkadeGame = {
  gameId: string;
  gameName: string;
  courseName: string | null;
  /** Oslo-kalenderåret runden hører til (`effectiveYear`). */
  year: number | null;
  /** `ended_at`. `null` ⇒ frysegrensen kan ikke etterprøves, runden utelates. */
  endedAt: Date | null;
  /** Effektiv runde-dato (`effectiveDate`) — datoen kortene viser. */
  playedAt: Date | null;
  players: KavalkadePlayerRound[];
};

export type KavalkadeInput = {
  /** Spilleren kavalkaden er for. */
  viewerUserId: string;
  /** Året som fortelles om (`KAVALKADE_YEAR`). */
  year: number;
  /** Frysegrensen (`KAVALKADE_CUTOFF`). Strengt før: `endedAt < cutoff`. */
  cutoff: Date;
  games: KavalkadeGame[];
};

// ---------------------------------------------------------------------------
// Ut
// ---------------------------------------------------------------------------

/** En navngitt spiller på et kort. */
export type KavalkadePlayerRef = { userId: string; name: string | null };

/** Beste runde i året — laveste brutto over komplette 18. */
export type BestRoundFact = {
  gameId: string;
  gameName: string;
  courseName: string | null;
  brutto: number;
  /** ISO-tid, eller `null` når runden er udaterbar. */
  playedAt: string | null;
};

/** Hullet som tok flest slag fra deg i år. */
export type NemesisHoleFact = {
  holeNumber: number;
  /** Antall ganger hullet ble spilt i året. Alltid ≥ `NEMESIS_MIN_PLAYED`. */
  played: number;
  /** Snitt mot par, positivt = over par. Avrundet til to desimaler. */
  averageToPar: number;
  /** Flest slag på hullet i året — det verste enkeltbesøket. */
  worstStrokes: number;
};

/** Regnskapet mot den du møtte oftest. */
export type RivalFact = {
  userId: string;
  name: string | null;
  /** Ferdige runder dere begge var med i. */
  met: number;
  /** Runder der begge har et sammenliknbart lagret utfall. */
  decided: number;
  wins: number;
  losses: number;
  ties: number;
};

/** Formtoppen: det beste strekket, og hele sesongen sett under ett. */
export type FormPeakFact = {
  /**
   * Beste sammenhengende 3-rundersstrekk (laveste snitt-brutto over komplette 18).
   * `null` når året har færre enn tre komplette runder.
   */
  stretch: {
    rounds: number;
    /** Snitt brutto over vinduet, avrundet. */
    averageBrutto: number;
    fromDate: string | null;
    toDate: string | null;
  } | null;
  /**
   * Start / nå / beste for brutto og netto over årets komplette runder, fra
   * `summarizeTrendRounds`. `null` når året ikke har noen komplett runde.
   */
  season: TrendSummary | null;
};

export type PersonalFacts = {
  /** Ferdige runder i året (alle, ikke bare komplette 18). */
  rounds: number;
  /**
   * Årets totaler fra `computeSeasonStats` — samme aggregat som sesong-recapen på
   * `/profile/historikk`, så kavalkaden og huben ikke kan si ulike tall. `null` er
   * i praksis umulig her (terskelen garanterer minst tre daterte runder), men
   * typen holder muligheten åpen.
   */
  season: SeasonSummary | null;
  bestRound: BestRoundFact | null;
  nemesisHole: NemesisHoleFact | null;
  rival: RivalFact | null;
  formPeak: FormPeakFact;
};

/** Én rad på et «mest av noe»-kort. */
export type GangLeaderFact = KavalkadePlayerRef & { count: number };

/** Tetteste oppgjør — minste brutto-gap mellom de to beste i samme runde. */
export type TightestFinishFact = {
  gameId: string;
  gameName: string;
  courseName: string | null;
  playedAt: string | null;
  /** Slag mellom beste og nest beste brutto. `0` ⇒ delt ledelse. */
  strokeMargin: number;
  leader: KavalkadePlayerRef & { brutto: number };
  runnerUp: KavalkadePlayerRef & { brutto: number };
};

export type GangFacts = {
  /** Spillere i kretsen, spilleren selv medregnet. */
  members: number;
  /** Ferdige runder kretsen delte i året. */
  games: number;
  topWinner: GangLeaderFact | null;
  mostBirdies: GangLeaderFact | null;
  mostSnowmen: GangLeaderFact | null;
  tightestFinish: TightestFinishFact | null;
};

export type KavalkadeFacts = {
  year: number;
  /** Frysegrensen fakta ble regnet mot, som ISO. */
  cutoff: string;
  /** Spillerens ferdige runder i året. */
  rounds: number;
  /** Terskelen for personlige kort. */
  roundsNeeded: number;
  /** `null` når spilleren har færre enn `roundsNeeded` ferdige runder. */
  personal: PersonalFacts | null;
  /** `null` når ingen ferdige runder i året ble funnet. */
  gang: GangFacts | null;
};

// ---------------------------------------------------------------------------
// Byggeren
// ---------------------------------------------------------------------------

/**
 * Bygger hele fakta-JSON-en for én spillers kavalkade.
 *
 * Kallstedet sender rå-ish runder inn; her filtreres de på år og frysegrense, og
 * resten er ren aggregering. Ingen kast: mangler data for et kort, blir kortet
 * `null` og K3 hopper over det.
 */
export function buildKavalkadeFacts(input: KavalkadeInput): KavalkadeFacts {
  const { viewerUserId, year, cutoff } = input;

  const games = input.games
    .filter((game) => isWithinCavalcade(game, year, cutoff))
    .sort(byPlayedAtAscending);

  // Runder der spilleren selv faktisk deltok (og ikke trakk seg).
  const mine = games
    .map((game) => ({ game, me: activePlayer(game, viewerUserId) }))
    .filter((row): row is { game: KavalkadeGame; me: KavalkadePlayerRound } =>
      row.me != null,
    );

  const rounds = mine.length;

  return {
    year,
    cutoff: cutoff.toISOString(),
    rounds,
    roundsNeeded: KAVALKADE_ROUNDS_NEEDED,
    personal:
      rounds >= KAVALKADE_ROUNDS_NEEDED
        ? buildPersonalFacts(mine, viewerUserId)
        : null,
    gang: mine.length > 0 ? buildGangFacts(mine.map((row) => row.game)) : null,
  };
}

/** Rett år, avsluttet, og avsluttet strengt før frysegrensen. */
function isWithinCavalcade(
  game: KavalkadeGame,
  year: number,
  cutoff: Date,
): boolean {
  if (game.year !== year) return false;
  if (game.endedAt == null) return false;
  return game.endedAt.getTime() < cutoff.getTime();
}

/** Eldste runde først. Udaterte runder havner sist, i stabil rekkefølge. */
function byPlayedAtAscending(a: KavalkadeGame, b: KavalkadeGame): number {
  const at = a.playedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.playedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0;
}

/** Spillerens rad i runden, eller `null` om hen ikke var med / trakk seg. */
function activePlayer(
  game: KavalkadeGame,
  userId: string,
): KavalkadePlayerRound | null {
  const row = game.players.find((p) => p.userId === userId);
  return row && row.withdrawnAt == null ? row : null;
}

/** Alle som faktisk gikk runden. */
function activePlayers(game: KavalkadeGame): KavalkadePlayerRound[] {
  return game.players.filter((p) => p.withdrawnAt == null);
}

/** Hull med slag ført — de eneste som teller noe sted. */
function playedHoles(player: KavalkadePlayerRound): HoleScore[] {
  return player.holes.filter((h) => h.strokes != null);
}

/**
 * Brutto for en komplett 18-hulls-runde, ellers `null`. Bruker `computeRoundScore`,
 * samme kilde som Hjem og historikk, så tallene ikke kan drifte fra hverandre.
 */
function completeBrutto(player: KavalkadePlayerRound): number | null {
  const holes = playedHoles(player);
  if (holes.length !== COMPLETE_ROUND_HOLES) return null;
  const { brutto } = computeRoundScore(
    holes.map((h) => h.strokes),
    player.courseHandicap,
  );
  return brutto;
}

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Personlig --------------------------------------------------------------

type MyRound = { game: KavalkadeGame; me: KavalkadePlayerRound };

function buildPersonalFacts(mine: MyRound[], viewerUserId: string): PersonalFacts {
  // Alle runder her er allerede filtrert til ETT år, så recapen gir én bøtte.
  // Den er sannhetskilden for årets totaler; `bestRound` under legger bare
  // runde-navnet og banen på det samme tallet (testen holder de to i lås).
  const seasonRounds: SeasonRoundInput[] = mine.map(({ game, me }) => ({
    year: game.year,
    completeBrutto: completeBrutto(me),
    achievements: countRoundAchievements(me.holes),
  }));

  return {
    rounds: mine.length,
    season: computeSeasonStats(seasonRounds)[0] ?? null,
    bestRound: findBestRound(mine),
    nemesisHole: findNemesisHole(mine),
    rival: findRival(mine, viewerUserId),
    formPeak: buildFormPeak(mine),
  };
}

/** Laveste brutto over komplette runder. Ved likhet vinner den tidligste — rekorden
 *  ble satt første gang den ble nådd (samme regel som formkurvens rekord-ring). */
function findBestRound(mine: MyRound[]): BestRoundFact | null {
  let best: BestRoundFact | null = null;
  for (const { game, me } of mine) {
    const brutto = completeBrutto(me);
    if (brutto == null) continue;
    if (best == null || brutto < best.brutto) {
      best = {
        gameId: game.gameId,
        gameName: game.gameName,
        courseName: game.courseName,
        brutto,
        playedAt: toIso(game.playedAt),
      };
    }
  }
  return best;
}

/**
 * Hullet med dårligst snitt mot par over året, minst tre spilte ganger. Ved likt
 * snitt vinner hullet du har spilt flest ganger, så det laveste hullnummeret —
 * deterministisk, så to kjøringer aldri gir ulikt kort.
 */
function findNemesisHole(mine: MyRound[]): NemesisHoleFact | null {
  type Bucket = { played: number; toParSum: number; worstStrokes: number };
  const buckets = new Map<number, Bucket>();

  for (const { me } of mine) {
    for (const hole of playedHoles(me)) {
      if (hole.par <= 0 || hole.strokes == null) continue;
      let bucket = buckets.get(hole.holeNumber);
      if (!bucket) {
        bucket = { played: 0, toParSum: 0, worstStrokes: 0 };
        buckets.set(hole.holeNumber, bucket);
      }
      bucket.played += 1;
      bucket.toParSum += hole.strokes - hole.par;
      bucket.worstStrokes = Math.max(bucket.worstStrokes, hole.strokes);
    }
  }

  let best: NemesisHoleFact | null = null;
  for (const [holeNumber, bucket] of buckets) {
    if (bucket.played < NEMESIS_MIN_PLAYED) continue;
    const averageToPar = round2(bucket.toParSum / bucket.played);
    const candidate: NemesisHoleFact = {
      holeNumber,
      played: bucket.played,
      averageToPar,
      worstStrokes: bucket.worstStrokes,
    };
    if (best == null || beatsNemesis(candidate, best)) best = candidate;
  }
  return best;
}

function beatsNemesis(a: NemesisHoleFact, b: NemesisHoleFact): boolean {
  if (a.averageToPar !== b.averageToPar) return a.averageToPar > b.averageToPar;
  if (a.played !== b.played) return a.played > b.played;
  return a.holeNumber < b.holeNumber;
}

/**
 * Medspilleren du møtte oftest, og regnskapet mot hen.
 *
 * Utfallet leses av de lagrede `result_summary`-ene (#572), aldri av en ny
 * beregning: det er den samme kilden klubbstatistikken bruker. Bare runder der
 * BEGGE har et utfall av samme form sammenliknes — en placement-rank og et
 * matchplay-utfall er ikke samme skala. Runder uten sammenliknbart utfall teller
 * som møter, men ikke som avgjorte.
 *
 * Ved likt antall møter vinner den du spilte med sist, så laveste `userId`.
 */
function findRival(mine: MyRound[], viewerUserId: string): RivalFact | null {
  type Tally = {
    userId: string;
    name: string | null;
    met: number;
    lastMetAt: number;
    wins: number;
    losses: number;
    ties: number;
    decided: number;
  };
  const tallies = new Map<string, Tally>();

  for (const { game, me } of mine) {
    const myRank = comparableRank(me.resultSummary);
    for (const other of activePlayers(game)) {
      if (other.userId === viewerUserId) continue;
      let tally = tallies.get(other.userId);
      if (!tally) {
        tally = {
          userId: other.userId,
          name: other.name,
          met: 0,
          lastMetAt: Number.NEGATIVE_INFINITY,
          wins: 0,
          losses: 0,
          ties: 0,
          decided: 0,
        };
        tallies.set(other.userId, tally);
      }
      tally.met += 1;
      tally.name = tally.name ?? other.name;
      tally.lastMetAt = Math.max(
        tally.lastMetAt,
        game.playedAt?.getTime() ?? Number.NEGATIVE_INFINITY,
      );

      const theirRank = comparableRank(other.resultSummary);
      if (myRank == null || theirRank == null) continue;
      if (myRank.kind !== theirRank.kind) continue;
      tally.decided += 1;
      if (myRank.value < theirRank.value) tally.wins += 1;
      else if (myRank.value > theirRank.value) tally.losses += 1;
      else tally.ties += 1;
    }
  }

  let best: Tally | null = null;
  for (const tally of tallies.values()) {
    if (best == null || beatsRival(tally, best)) best = tally;
  }
  if (best == null) return null;

  return {
    userId: best.userId,
    name: best.name,
    met: best.met,
    decided: best.decided,
    wins: best.wins,
    losses: best.losses,
    ties: best.ties,
  };
}

function beatsRival(
  a: { met: number; lastMetAt: number; userId: string },
  b: { met: number; lastMetAt: number; userId: string },
): boolean {
  if (a.met !== b.met) return a.met > b.met;
  if (a.lastMetAt !== b.lastMetAt) return a.lastMetAt > b.lastMetAt;
  return a.userId < b.userId;
}

/**
 * Oversetter et lagret utfall til en sammenliknbar rangering der lavere er bedre.
 * `kind` følger med så vi aldri måler placement mot matchplay.
 */
function comparableRank(
  summary: ResultSummary | null,
): { kind: ResultSummary['kind']; value: number } | null {
  if (summary == null) return null;
  switch (summary.kind) {
    case 'placement':
      return { kind: 'placement', value: summary.rank };
    case 'skins':
      return { kind: 'skins', value: summary.rank };
    case 'matchplay':
      return {
        kind: 'matchplay',
        value:
          summary.outcome === 'win' ? 1 : summary.outcome === 'tie' ? 2 : 3,
      };
    default:
      return null;
  }
}

/**
 * Formtoppen, i to former så K3 kan velge: det beste sammenhengende
 * 3-rundersstrekket, og hele sesongen sett under ett (`summarizeTrendRounds`).
 * Begge regnes bare over komplette 18-runder, eldste først.
 */
function buildFormPeak(mine: MyRound[]): FormPeakFact {
  const complete = mine
    .map(({ game, me }) => {
      const holes = playedHoles(me);
      if (holes.length !== COMPLETE_ROUND_HOLES) return null;
      const { brutto, netto } = computeRoundScore(
        holes.map((h) => h.strokes),
        me.courseHandicap,
      );
      if (brutto == null) return null;
      return { brutto, netto, playedAt: game.playedAt };
    })
    .filter((r): r is { brutto: number; netto: number | null; playedAt: Date | null } =>
      r != null,
    );

  if (complete.length === 0) return { stretch: null, season: null };

  const trendRounds: TrendRound[] = complete.map((r) => ({
    brutto: r.brutto,
    netto: r.netto,
  }));
  const season = summarizeTrendRounds(trendRounds);

  if (complete.length < FORM_PEAK_WINDOW) return { stretch: null, season };

  // Glidende vindu. Strengt `<` beholder det TIDLIGSTE vinduet ved likhet.
  let bestStart = 0;
  let bestSum = Number.POSITIVE_INFINITY;
  for (let i = 0; i + FORM_PEAK_WINDOW <= complete.length; i++) {
    let sum = 0;
    for (let j = i; j < i + FORM_PEAK_WINDOW; j++) sum += complete[j].brutto;
    if (sum < bestSum) {
      bestSum = sum;
      bestStart = i;
    }
  }

  return {
    stretch: {
      rounds: FORM_PEAK_WINDOW,
      averageBrutto: Math.round(bestSum / FORM_PEAK_WINDOW),
      fromDate: toIso(complete[bestStart].playedAt),
      toDate: toIso(complete[bestStart + FORM_PEAK_WINDOW - 1].playedAt),
    },
    season,
  };
}

// --- Gjengen ----------------------------------------------------------------

/**
 * Gjengens kavalkade, regnet over rundene spilleren delte med dem i året.
 *
 * Kretsen er «alle du har fullført minst ett spill med i året» (eieren,
 * 2026-09-16), og tallene kommer fra nettopp de rundene. Vi henter bevisst ikke
 * medspillernes ANDRE runder: et ferdig spill er ikke world-read (#1542), og
 * kavalkaden skal ikke bli en bakvei inn i tall spilleren ellers ikke ser.
 */
function buildGangFacts(games: KavalkadeGame[]): GangFacts {
  const names = new Map<string, string | null>();
  const wins = new Map<string, number>();
  const birdies = new Map<string, number>();
  const snowmen = new Map<string, number>();
  const played = new Map<string, number>();

  for (const game of games) {
    for (const player of activePlayers(game)) {
      if (!names.has(player.userId) || names.get(player.userId) == null) {
        names.set(player.userId, player.name);
      }
      bump(played, player.userId, 1);
      if (isWinningSummary(player.resultSummary)) bump(wins, player.userId, 1);

      const achievements = countRoundAchievements(player.holes);
      bump(birdies, player.userId, achievements.birdie);
      bump(snowmen, player.userId, achievements.snowman);
    }
  }

  return {
    members: names.size,
    games: games.length,
    topWinner: pickLeader(wins, played, names),
    mostBirdies: pickLeader(birdies, played, names),
    mostSnowmen: pickLeader(snowmen, played, names),
    tightestFinish: findTightestFinish(games),
  };
}

function bump(counts: Map<string, number>, userId: string, by: number): void {
  if (by === 0) return;
  counts.set(userId, (counts.get(userId) ?? 0) + by);
}

/**
 * Den med høyest tall. Ved likhet vinner den som spilte flest av rundene, så
 * laveste `userId`. `null` når ingen har mer enn null — et tomt kort er bedre enn
 * et kort som kårer en tilfeldig «vinner» med 0.
 */
function pickLeader(
  counts: Map<string, number>,
  played: Map<string, number>,
  names: Map<string, string | null>,
): GangLeaderFact | null {
  let bestUserId: string | null = null;
  let bestCount = 0;
  for (const [userId, count] of counts) {
    if (count <= 0) continue;
    if (bestUserId == null || count > bestCount) {
      bestUserId = userId;
      bestCount = count;
      continue;
    }
    if (count === bestCount) {
      const bestPlayed = played.get(bestUserId) ?? 0;
      const thisPlayed = played.get(userId) ?? 0;
      if (thisPlayed > bestPlayed || (thisPlayed === bestPlayed && userId < bestUserId)) {
        bestUserId = userId;
      }
    }
  }
  if (bestUserId == null) return null;
  return {
    userId: bestUserId,
    name: names.get(bestUserId) ?? null,
    count: bestCount,
  };
}

/**
 * Tetteste oppgjør: runden der de to laveste komplette brutto-totalene lå nærmest
 * hverandre.
 *
 * Marginen måles i SLAG, ikke i modus-margin. En matchplay-margin («3&2») og en
 * plassering lar seg ikke sammenlikne på tvers av modi, mens et slag-gap betyr det
 * samme i alle runder. Bare komplette 18-runder er med, av samme grunn som resten
 * av brutto-tallene. Ved lik margin vinner den nyeste runden.
 */
function findTightestFinish(games: KavalkadeGame[]): TightestFinishFact | null {
  let best: TightestFinishFact | null = null;
  let bestPlayedAt = Number.NEGATIVE_INFINITY;

  for (const game of games) {
    const scored = activePlayers(game)
      .map((player) => {
        const brutto = completeBrutto(player);
        return brutto == null
          ? null
          : { userId: player.userId, name: player.name, brutto };
      })
      .filter((r): r is { userId: string; name: string | null; brutto: number } =>
        r != null,
      )
      .sort((a, b) =>
        a.brutto !== b.brutto
          ? a.brutto - b.brutto
          : a.userId < b.userId
            ? -1
            : 1,
      );

    if (scored.length < 2) continue;

    const [leader, runnerUp] = scored;
    const strokeMargin = runnerUp.brutto - leader.brutto;
    const playedAt = game.playedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

    const tighter = best == null || strokeMargin < best.strokeMargin;
    const sameButNewer =
      best != null && strokeMargin === best.strokeMargin && playedAt > bestPlayedAt;
    if (!tighter && !sameButNewer) continue;

    best = {
      gameId: game.gameId,
      gameName: game.gameName,
      courseName: game.courseName,
      playedAt: toIso(game.playedAt),
      strokeMargin,
      leader,
      runnerUp,
    };
    bestPlayedAt = playedAt;
  }

  return best;
}
