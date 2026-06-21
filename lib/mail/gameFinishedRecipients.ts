// Helper for endGame-actions: bygger en liste med mail-mottakere som hver
// inkluderer mode-spesifikk personalisering (rank + poeng for stableford,
// ingenting ekstra for best-ball-netto).
//
// Hentes inn av både `endGame` og `endGameWithSideWinners` slik at logikken
// for å regne ut stableford-leaderboard kun bor ett sted.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  COURSE_HOLES_SELECT,
  SCORES_SELECT,
  type CourseHoleRow,
  type ScoreRow,
} from '@/lib/supabase/queryFragments';
import { computeLeaderboard } from '@/lib/scoring';
import {
  isStablefordFamily,
  isScrambleFamily,
  type GameMode,
  type GameModeConfig,
  type ScoringGender,
} from '@/lib/scoring/modes/types';
import { firstName } from '@/lib/firstName';
import type { GameFinishedNotificationMode } from './gameFinishedNotification';

export interface FinishedMailRecipient {
  /**
   * Spillerens auth-user-id. Brukes av caller for å filtrere mottakerlisten
   * mot in-app-notify-utfallet (Phase 4 mail-gating på `shouldAlsoSendMail`).
   */
  userId: string;
  email: string;
  /** Navn fra users-raden — caller mapper til firstName ved behov. */
  name: string | null;
  /** Mottakerens locale fra users-raden (#594). `null` → mail-laget defaulter til 'no'. */
  locale: string | null;
  /** Mode-spesifikk personalisering. `undefined` for best-ball-netto. */
  mode?: GameFinishedNotificationMode;
}

/**
 * Bygger mail-mottaker-listen for «Resultatet er klart»-blasten.
 *
 * For stableford fetcher vi:
 *   - alle game_players (user_id, course_handicap, email, name)
 *   - alle scores for spillet
 *   - course_holes (par, stroke_index) for banen
 * og kjører `computeLeaderboard` mode-router for å regne ut rank + poeng per
 * spiller. Hver mottaker får en personlig stableford-mode med sin egen
 * plassering.
 *
 * For best-ball-netto holder vi det enkelt — dagens nøytrale «leaderboard er
 * åpen»-mail dekker alle spillerne. Vi unngår å vise lag-vinner-info per
 * spiller siden lag-tilhørighet kompliserer copy-en uten å gi mye verdi.
 *
 * Returnerer en flat liste med kun spillere som faktisk har gyldig email.
 * Spillere uten email droppes (ingen feil — admin kan ikke maile dem uansett).
 */
export async function buildGameFinishedRecipients(
  supabase: SupabaseClient<Database>,
  gameId: string,
  game: {
    course_id: string;
    game_mode: GameMode;
    mode_config: GameModeConfig;
  },
): Promise<FinishedMailRecipient[]> {
  // Felles fetch: hent game_players med email + course_handicap + team_number.
  // Gjelder begge moduser, så vi gjør den én gang. `team_number` brukes kun
  // av team-stableford-grenen (for partner-name-lookup), men har null cost å
  // ta med — kolonnen står på alle game_players-rader (NOT NULL siden 0030).
  const { data: playerRows, error: playerErr } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, tee_gender, course_handicap, users!game_players_user_id_fkey(email, name, locale)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        team_number: number | null;
        tee_gender: ScoringGender;
        course_handicap: number | null;
        users: { email: string | null; name: string | null; locale: string | null } | null;
      }[]
    >();
  if (playerErr || !playerRows) {
    // Defensiv: returner tom liste i stedet for å kaste. Mail-blasten er
    // best-effort, og en feil her skal ikke blokkere selve avslutt-flyten.
    console.error(
      '[buildGameFinishedRecipients] failed to fetch players',
      playerErr,
    );
    return [];
  }

  // Singles matchplay (epic #45): bygg per-spiller payload med motspillerens
  // navn + match-resultat sett FRA mottakerens perspektiv. Speilet pattern
  // som team-stableford-grenen, men forenklet siden det alltid er to spillere
  // med team_number 1 og 2 (validatoren håndhever 1+1).
  //
  // Vi kjører `computeLeaderboard` (mode-router) for å få
  // `SinglesMatchplayResult.result` — den inneholder `winner` ('side1' |
  // 'side2' | 'tied') og `formatted`-strengen ('3&2' / '1up' / 'AS'). Hver
  // spillers `team_number` mapper til sideNumber (1 eller 2), så vi vet
  // hvem som vant fra spillerens synspunkt.
  //
  // Hvis matchen ikke er avgjort (`result.result === null` — meget sjelden,
  // gitt at endGame validerer alle scorekort er levert), faller vi tilbake
  // til best-ball-default for å unngå halvferdig copy.
  if (game.game_mode === 'singles_matchplay') {
    return buildMatchplayRecipients(supabase, gameId, game, playerRows);
  }

  // Solo strokeplay (epic #46): bygg per-spiller payload med rank +
  // totalNetStrokes + totalGrossStrokes + totalPlayers. Speilet solo-stableford-
  // grenen strukturelt — én rad per spiller direkte fra
  // `SoloStrokeplayResult.players`. Hvis mode-router returnerer noe uventet,
  // faller vi tilbake til nøytral best-ball-default copy.
  if (game.game_mode === 'solo_strokeplay') {
    return buildSoloStrokeplayRecipients(supabase, gameId, game, playerRows);
  }

  // Texas scramble (issue #44) og Ambrose (issue #284): bygg per-spiller payload
  // med teamRank + teamTotalNet + teamTotalGross + teamPartnerNames + totalTeams.
  // Ambrose gjenbruker Texas-grenen siden `ambrose.compute()` returnerer
  // `kind: 'texas_scramble'` og mail-body-en er format-agnostisk («Laget endte
  // på X. plass …»). Ingen ny mail-variant eller snapshot.
  if (isScrambleFamily(game.game_mode)) {
    return buildTexasScrambleRecipients(supabase, gameId, game, playerRows);
  }

  // Best-ball-netto: ingen per-spiller-mode, returner kun userId+email+name+locale.
  if (!isStablefordFamily(game.game_mode)) {
    return playerRows
      .map((row) => ({
        userId: row.user_id,
        email: row.users?.email ?? null,
        name: row.users?.name ?? null,
        locale: row.users?.locale ?? null,
      }))
      .filter((r): r is FinishedMailRecipient => {
        return typeof r.email === 'string' && r.email.length > 0;
      });
  }

  // Stableford-grenen: hent scores + course_holes for å kunne kjøre
  // mode-router-en. Begge queries i parallell for hastighet.
  const [scoresRes, holesRes] = await Promise.all([
    supabase
      .from('scores')
      .select(SCORES_SELECT)
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
  ]);
  if (scoresRes.error || holesRes.error) {
    console.error(
      '[buildGameFinishedRecipients] failed to fetch scores/holes',
      scoresRes.error ?? holesRes.error,
    );
    return [];
  }

  const result = computeLeaderboard({
    game: {
      id: gameId,
      game_mode: 'stableford',
      mode_config: game.mode_config,
    },
    players: playerRows.map((row) => ({
      userId: row.user_id,
      // Team-grenen i stableford-scoring grupperer på teamNumber, så vi MÅ
      // sende det videre for par-stableford. Solo-grenen ignorerer feltet,
      // så ingen skade i å sende det også der.
      teamNumber: row.team_number,
      flightNumber: null,
      courseHandicap: row.course_handicap ?? 0,
      // #240 — stableford-poeng per spiller skal bruke per-kjønn-par når
      // dame/junior har avvikende hull-par. parFor() leser av tabellen
      // basert på teeGender.
      teeGender: row.tee_gender,
    })),
    holes: (holesRes.data ?? []).map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      // #240 — full per-kjønn-par-tabell. Lik for alle kjønn = ingen effekt;
      // avvikende = scoring-modulen velger riktig variant per spiller.
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: (scoresRes.data ?? []).map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  });

  if (result.kind !== 'stableford') {
    // Defensive: mode-router gav noe uventet. Fall til best-ball-copy.
    return playerRows
      .map((row) => ({
        userId: row.user_id,
        email: row.users?.email ?? null,
        name: row.users?.name ?? null,
        locale: row.users?.locale ?? null,
      }))
      .filter((r): r is FinishedMailRecipient => {
        return typeof r.email === 'string' && r.email.length > 0;
      });
  }

  // Solo-stableford: én rad per spiller, rank/poeng per-spiller direkte
  // fra result.players.
  if (result.variant === 'solo') {
    const totalPlayers = result.players.length;
    const lineByUserId = new Map(result.players.map((p) => [p.userId, p]));

    const recipients: FinishedMailRecipient[] = [];
    for (const row of playerRows) {
      const email = row.users?.email ?? null;
      if (!email) continue;
      const line = lineByUserId.get(row.user_id);
      const mode: GameFinishedNotificationMode | undefined = line
        ? {
            kind: 'stableford',
            variant: 'solo',
            rank: line.rank,
            totalPoints: line.totalPoints,
            totalPlayers,
          }
        : undefined;
      recipients.push({
        userId: row.user_id,
        email,
        name: row.users?.name ?? null,
        locale: row.users?.locale ?? null,
        mode,
      });
    }
    return recipients;
  }

  // Team-stableford (par-stableford / 4BBB): én rad per LAG, hver spiller
  // på laget får samme teamRank + teamTotalPoints, men sin egen partner.
  const totalTeams = result.teams.length;
  // Map userId → team-line + alle lagmedlemmer (for partner-name-lookup).
  type TeamContext = {
    teamRank: number;
    teamTotalPoints: number;
    memberUserIds: string[];
  };
  const teamCtxByUserId = new Map<string, TeamContext>();
  for (const team of result.teams) {
    const ctx: TeamContext = {
      teamRank: team.rank,
      teamTotalPoints: team.totalPoints,
      memberUserIds: team.playerIds,
    };
    for (const uid of team.playerIds) {
      teamCtxByUserId.set(uid, ctx);
    }
  }

  // Bygg navn-map fra playerRows slik at vi kan slå opp partnerens fornavn
  // uten ekstra DB-roundtrip.
  const nameByUserId = new Map<string, string | null>();
  for (const row of playerRows) {
    nameByUserId.set(row.user_id, row.users?.name ?? null);
  }

  const recipients: FinishedMailRecipient[] = [];
  for (const row of playerRows) {
    const email = row.users?.email ?? null;
    if (!email) continue;
    const ctx = teamCtxByUserId.get(row.user_id);
    let mode: GameFinishedNotificationMode | undefined;
    if (ctx) {
      // Partner = alle på laget unntatt meg selv. Par-stableford har 2 per
      // lag, så det blir én entry her — men loop-en håndterer trygt edge-
      // cases (1 eller flere "partnere"). Tar første ikke-tomme fornavn.
      const partnerIds = ctx.memberUserIds.filter((id) => id !== row.user_id);
      const partnerName =
        partnerIds.length > 0
          ? firstName(nameByUserId.get(partnerIds[0]) ?? null) ?? null
          : null;
      mode = {
        kind: 'stableford',
        variant: 'team',
        teamRank: ctx.teamRank,
        teamTotalPoints: ctx.teamTotalPoints,
        teamPartnerName: partnerName,
        totalTeams,
      };
    }
    recipients.push({
      userId: row.user_id,
      email,
      name: row.users?.name ?? null,
      locale: row.users?.locale ?? null,
      mode,
    });
  }
  return recipients;
}

/**
 * Bygger mottakerlisten for singles matchplay (epic #45). Hver av de to
 * spillerne får sin egen mode-payload med motspillerens fornavn + match-
 * resultat (won / lost / tied) sett FRA mottakerens side.
 *
 * Forutsetter (validert av payload-laget ved publish):
 *  - nøyaktig 2 spillere
 *  - team_number er 1 eller 2 (én på hver side)
 *
 * Defensive fallbacks:
 *  - hvis matchen ikke er avgjort (`result.result === null` — meget sjelden
 *    siden endGame validerer at alle scorekort er levert), faller vi tilbake
 *    til nøytral best-ball-default copy (uten mode-payload).
 *  - hvis result-formen er uventet (mode-router gav noe annet enn
 *    'singles_matchplay'), samme fallback.
 *  - hvis motspillerens navn mangler eller fornavn ikke kan parses, settes
 *    `opponentName: null` — mail-laget bytter til «motstanderen»-fallback.
 */
async function buildMatchplayRecipients(
  supabase: SupabaseClient<Database>,
  gameId: string,
  game: { course_id: string; game_mode: GameMode; mode_config: GameModeConfig },
  playerRows: {
    user_id: string;
    team_number: number | null;
    tee_gender: ScoringGender;
    course_handicap: number | null;
    users: { email: string | null; name: string | null; locale: string | null } | null;
  }[],
): Promise<FinishedMailRecipient[]> {
  const [scoresRes, holesRes] = await Promise.all([
    supabase
      .from('scores')
      .select(SCORES_SELECT)
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
  ]);
  if (scoresRes.error || holesRes.error) {
    console.error(
      '[buildMatchplayRecipients] failed to fetch scores/holes',
      scoresRes.error ?? holesRes.error,
    );
    return [];
  }

  const result = computeLeaderboard({
    game: {
      id: gameId,
      game_mode: 'singles_matchplay',
      mode_config: game.mode_config,
    },
    players: playerRows.map((row) => ({
      userId: row.user_id,
      teamNumber: row.team_number,
      flightNumber: null,
      courseHandicap: row.course_handicap ?? 0,
      // #240 — per-side par på matchplay-hull leses fra parFor(hole, side.teeGender).
      teeGender: row.tee_gender,
    })),
    holes: (holesRes.data ?? []).map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      // #240 — per-kjønn-par-tabell. Matchplay-modulen leser per-side-par via
      // parFor() når sidene har ulik teeGender og hullet har avvik.
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: (scoresRes.data ?? []).map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  });

  // Defensive fallback: mode-router returnerte noe annet enn matchplay, eller
  // matchen er ikke avgjort. Send nøytral default copy uten mode-payload.
  if (result.kind !== 'singles_matchplay' || result.result === null) {
    return playerRows
      .map((row) => ({
        userId: row.user_id,
        email: row.users?.email ?? null,
        name: row.users?.name ?? null,
        locale: row.users?.locale ?? null,
      }))
      .filter((r): r is FinishedMailRecipient => {
        return typeof r.email === 'string' && r.email.length > 0;
      });
  }

  const matchResult = result.result;
  const formatted = matchResult.formatted;

  // Bygg user→side-map fra scoring-laget. Sidene er alltid sortert side 1
  // først, side 2 sist (tuple-garanti i `SinglesMatchplayResult.sides`).
  const sideByUserId = new Map<string, 1 | 2>();
  for (const side of result.sides) {
    if (side.userId) sideByUserId.set(side.userId, side.sideNumber);
  }

  // Navn-map for motspiller-lookup.
  const nameByUserId = new Map<string, string | null>();
  for (const row of playerRows) {
    nameByUserId.set(row.user_id, row.users?.name ?? null);
  }

  const recipients: FinishedMailRecipient[] = [];
  for (const row of playerRows) {
    const email = row.users?.email ?? null;
    if (!email) continue;

    const selfSide = sideByUserId.get(row.user_id);
    // Defensive: hvis spilleren ikke er på en kjent side (validatoren burde
    // ha håndhevet 1+1, men data-laget kan i teorien ha rar state), dropp
    // mode-payload — send nøytral copy.
    if (selfSide !== 1 && selfSide !== 2) {
      recipients.push({
        userId: row.user_id,
        email,
        name: row.users?.name ?? null,
        locale: row.users?.locale ?? null,
      });
      continue;
    }

    // Finn motspilleren. Det er alltid nøyaktig én — den andre siden.
    const opponentRow = playerRows.find(
      (other) =>
        other.user_id !== row.user_id &&
        sideByUserId.get(other.user_id) !== selfSide,
    );
    const opponentName = opponentRow
      ? firstName(nameByUserId.get(opponentRow.user_id) ?? null) ?? null
      : null;

    let matchResultForSelf: 'won' | 'lost' | 'tied';
    if (matchResult.winner === 'tied') {
      matchResultForSelf = 'tied';
    } else if (
      (matchResult.winner === 'side1' && selfSide === 1) ||
      (matchResult.winner === 'side2' && selfSide === 2)
    ) {
      matchResultForSelf = 'won';
    } else {
      matchResultForSelf = 'lost';
    }

    recipients.push({
      userId: row.user_id,
      email,
      name: row.users?.name ?? null,
      locale: row.users?.locale ?? null,
      mode: {
        kind: 'singles_matchplay',
        matchResult: matchResultForSelf,
        formattedResult: formatted,
        opponentName,
        selfSide,
      },
    });
  }
  return recipients;
}

/**
 * Bygger mottakerlisten for solo strokeplay (epic #46). Hver spiller får
 * en personlig mode-payload med plassering + totalNetStrokes + totalGrossStrokes
 * + totalPlayers — speilet solo-stableford-pattern, men med slag i stedet for
 * poeng.
 *
 * Defensive fallbacks:
 *  - hvis mode-router returnerer noe annet enn `solo_strokeplay`, faller
 *    vi tilbake til nøytral best-ball-default copy (uten mode-payload).
 *  - spillere uten email droppes (samme regel som de andre grenene).
 *  - spillere uten resultat-rad (defensiv — alle game_players burde havne i
 *    leaderboardet) får ingen mode-payload, ender opp med nøytral copy.
 */
async function buildSoloStrokeplayRecipients(
  supabase: SupabaseClient<Database>,
  gameId: string,
  game: { course_id: string; game_mode: GameMode; mode_config: GameModeConfig },
  playerRows: {
    user_id: string;
    team_number: number | null;
    tee_gender: ScoringGender;
    course_handicap: number | null;
    users: { email: string | null; name: string | null; locale: string | null } | null;
  }[],
): Promise<FinishedMailRecipient[]> {
  const [scoresRes, holesRes] = await Promise.all([
    supabase
      .from('scores')
      .select(SCORES_SELECT)
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
  ]);
  if (scoresRes.error || holesRes.error) {
    console.error(
      '[buildSoloStrokeplayRecipients] failed to fetch scores/holes',
      scoresRes.error ?? holesRes.error,
    );
    return [];
  }

  const result = computeLeaderboard({
    game: {
      id: gameId,
      game_mode: 'solo_strokeplay',
      mode_config: game.mode_config,
    },
    players: playerRows.map((row) => ({
      userId: row.user_id,
      teamNumber: row.team_number,
      flightNumber: null,
      courseHandicap: row.course_handicap ?? 0,
      // #240 — solo strokeplay ranker på netto-slag, men teeGender sendes
      // gjennom for shape-konsistens med øvrige modi og fremtidig UI-bruk.
      teeGender: row.tee_gender,
    })),
    holes: (holesRes.data ?? []).map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      // #240 — per-kjønn-par-tabell. Solo strokeplay leser i hovedsak ikke
      // par direkte (ranker på netto), men holdes konsistent på shape-laget.
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: (scoresRes.data ?? []).map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  });

  // Defensive fallback: mode-router gav noe uventet. Fall til best-ball-copy.
  if (result.kind !== 'solo_strokeplay') {
    return playerRows
      .map((row) => ({
        userId: row.user_id,
        email: row.users?.email ?? null,
        name: row.users?.name ?? null,
        locale: row.users?.locale ?? null,
      }))
      .filter((r): r is FinishedMailRecipient => {
        return typeof r.email === 'string' && r.email.length > 0;
      });
  }

  const totalPlayers = result.players.length;
  const lineByUserId = new Map(result.players.map((p) => [p.userId, p]));

  const recipients: FinishedMailRecipient[] = [];
  for (const row of playerRows) {
    const email = row.users?.email ?? null;
    if (!email) continue;
    const line = lineByUserId.get(row.user_id);
    const mode: GameFinishedNotificationMode | undefined = line
      ? {
          kind: 'solo_strokeplay',
          rank: line.rank,
          totalNetStrokes: line.totalNetStrokes,
          totalGrossStrokes: line.totalGrossStrokes,
          totalPlayers,
        }
      : undefined;
    recipients.push({
      userId: row.user_id,
      email,
      name: row.users?.name ?? null,
      locale: row.users?.locale ?? null,
      mode,
    });
  }
  return recipients;
}

/**
 * Bygger mottakerlisten for Texas scramble (issue #44). Hver spiller på et
 * lag får samme teamRank + teamTotalNet + teamTotalGross, men sin egen
 * partner-liste (alle lag-medlemmer minus seg selv). Speilet par-stableford-
 * pattern, men med slag-totaler i stedet for poeng og N partnernavn i stedet
 * for én.
 *
 * Defensive fallbacks:
 *  - hvis mode-router returnerer noe annet enn `texas_scramble`, faller vi
 *    tilbake til nøytral best-ball-default copy.
 *  - spillere uten email droppes.
 *  - spillere uten lag-tilhørighet (defensiv — validator håndhever team_size
 *    2|4 ved publish) får ingen mode-payload.
 */
async function buildTexasScrambleRecipients(
  supabase: SupabaseClient<Database>,
  gameId: string,
  game: { course_id: string; game_mode: GameMode; mode_config: GameModeConfig },
  playerRows: {
    user_id: string;
    team_number: number | null;
    tee_gender: ScoringGender;
    course_handicap: number | null;
    users: { email: string | null; name: string | null; locale: string | null } | null;
  }[],
): Promise<FinishedMailRecipient[]> {
  const [scoresRes, holesRes] = await Promise.all([
    supabase
      .from('scores')
      .select(SCORES_SELECT)
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
  ]);
  if (scoresRes.error || holesRes.error) {
    console.error(
      '[buildTexasScrambleRecipients] failed to fetch scores/holes',
      scoresRes.error ?? holesRes.error,
    );
    return [];
  }

  const result = computeLeaderboard({
    game: {
      id: gameId,
      // Sender det reelle game_mode-et (texas_scramble, ambrose, eller
      // florida_scramble) slik at mode-router-en velger riktig compute-funksjon.
      // Alle returnerer kind: 'texas_scramble', så resultsjekken nedenfor holder.
      game_mode: game.game_mode,
      mode_config: game.mode_config,
    },
    players: playerRows.map((row) => ({
      userId: row.user_id,
      teamNumber: row.team_number,
      flightNumber: null,
      courseHandicap: row.course_handicap ?? 0,
      // #240 — Texas/Ambrose spiller én ball per lag, par avgjøres av
      // lag-kapteinens tee_gender (lex-min userId). Sender per-spiller teeGender.
      teeGender: row.tee_gender,
    })),
    holes: (holesRes.data ?? []).map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      // #240 — per-kjønn-par-tabell. Texas-modulen velger kaptein-varianten
      // via parFor() ved per-hull-utregning.
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: (scoresRes.data ?? []).map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  });

  // Defensive fallback: mode-router gav noe uventet. Fall til best-ball-copy.
  if (result.kind !== 'texas_scramble') {
    return playerRows
      .map((row) => ({
        userId: row.user_id,
        email: row.users?.email ?? null,
        name: row.users?.name ?? null,
        locale: row.users?.locale ?? null,
      }))
      .filter((r): r is FinishedMailRecipient => {
        return typeof r.email === 'string' && r.email.length > 0;
      });
  }

  const totalTeams = result.teams.length;

  // Map userId → team-line. Hver spiller på et lag mapper til samme line.
  type TeamContext = {
    teamRank: number;
    teamTotalNet: number;
    teamTotalGross: number;
    memberUserIds: string[];
  };
  const teamCtxByUserId = new Map<string, TeamContext>();
  for (const team of result.teams) {
    const memberUserIds = team.members.map((m) => m.userId);
    const ctx: TeamContext = {
      teamRank: team.rank,
      teamTotalNet: team.totalNet,
      teamTotalGross: team.totalGross,
      memberUserIds,
    };
    for (const uid of memberUserIds) {
      teamCtxByUserId.set(uid, ctx);
    }
  }

  // Navn-map for partner-lookup.
  const nameByUserId = new Map<string, string | null>();
  for (const row of playerRows) {
    nameByUserId.set(row.user_id, row.users?.name ?? null);
  }

  const recipients: FinishedMailRecipient[] = [];
  for (const row of playerRows) {
    const email = row.users?.email ?? null;
    if (!email) continue;
    const ctx = teamCtxByUserId.get(row.user_id);
    let mode: GameFinishedNotificationMode | undefined;
    if (ctx) {
      // Partnerliste = alle på laget unntatt meg selv. Filtrer ut tomme
      // navn slik at vi ikke produserer «Du spilte med » med dingleende komma.
      const partnerNames = ctx.memberUserIds
        .filter((id) => id !== row.user_id)
        .map((id) => firstName(nameByUserId.get(id) ?? null))
        .filter((name): name is string => typeof name === 'string' && name.length > 0);
      mode = {
        kind: 'texas_scramble',
        teamRank: ctx.teamRank,
        teamTotalNet: ctx.teamTotalNet,
        teamTotalGross: ctx.teamTotalGross,
        teamPartnerNames: partnerNames,
        totalTeams,
      };
    }
    recipients.push({
      userId: row.user_id,
      email,
      name: row.users?.name ?? null,
      locale: row.users?.locale ?? null,
      mode,
    });
  }
  return recipients;
}
