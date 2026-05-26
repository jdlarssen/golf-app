// Helper for endGame-actions: bygger en liste med mail-mottakere som hver
// inkluderer mode-spesifikk personalisering (rank + poeng for stableford,
// ingenting ekstra for best-ball-netto).
//
// Hentes inn av både `endGame` og `endGameWithSideWinners` slik at logikken
// for å regne ut stableford-leaderboard kun bor ett sted.

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeLeaderboard } from '@/lib/scoring';
import type {
  GameMode,
  GameModeConfig,
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
  supabase: SupabaseClient,
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
      'user_id, team_number, course_handicap, users!game_players_user_id_fkey(email, name)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        team_number: number | null;
        course_handicap: number | null;
        users: { email: string | null; name: string | null } | null;
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

  // Solo strokeplay netto (epic #46): bygg per-spiller payload med rank +
  // totalNetStrokes + totalGrossStrokes + totalPlayers. Speilet solo-stableford-
  // grenen strukturelt — én rad per spiller direkte fra
  // `SoloStrokeplayResult.players`. Hvis mode-router returnerer noe uventet,
  // faller vi tilbake til nøytral best-ball-default copy.
  if (game.game_mode === 'solo_strokeplay_netto') {
    return buildSoloStrokeplayRecipients(supabase, gameId, game, playerRows);
  }

  // Texas scramble (issue #44): bygg per-spiller payload med teamRank +
  // teamTotalNet + teamTotalGross + teamPartnerNames + totalTeams. Hver spiller
  // får samme team-stats men sin egen partnerliste (medlemmer minus seg selv).
  // Defensive fallback til best-ball-copy ved uventet result-shape.
  if (game.game_mode === 'texas_scramble') {
    return buildTexasScrambleRecipients(supabase, gameId, game, playerRows);
  }

  // Best-ball-netto: ingen per-spiller-mode, returner kun userId+email+name.
  if (game.game_mode !== 'stableford') {
    return playerRows
      .map((row) => ({
        userId: row.user_id,
        email: row.users?.email ?? null,
        name: row.users?.name ?? null,
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
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<
        { user_id: string; hole_number: number; strokes: number | null }[]
      >(),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<{ hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[]>(),
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
    })),
    holes: (holesRes.data ?? []).map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
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
  supabase: SupabaseClient,
  gameId: string,
  game: { course_id: string; game_mode: GameMode; mode_config: GameModeConfig },
  playerRows: {
    user_id: string;
    team_number: number | null;
    course_handicap: number | null;
    users: { email: string | null; name: string | null } | null;
  }[],
): Promise<FinishedMailRecipient[]> {
  const [scoresRes, holesRes] = await Promise.all([
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<
        { user_id: string; hole_number: number; strokes: number | null }[]
      >(),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<{ hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[]>(),
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
    })),
    holes: (holesRes.data ?? []).map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
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
 * Bygger mottakerlisten for solo strokeplay netto (epic #46). Hver spiller får
 * en personlig mode-payload med plassering + totalNetStrokes + totalGrossStrokes
 * + totalPlayers — speilet solo-stableford-pattern, men med slag i stedet for
 * poeng.
 *
 * Defensive fallbacks:
 *  - hvis mode-router returnerer noe annet enn `solo_strokeplay_netto`, faller
 *    vi tilbake til nøytral best-ball-default copy (uten mode-payload).
 *  - spillere uten email droppes (samme regel som de andre grenene).
 *  - spillere uten resultat-rad (defensiv — alle game_players burde havne i
 *    leaderboardet) får ingen mode-payload, ender opp med nøytral copy.
 */
async function buildSoloStrokeplayRecipients(
  supabase: SupabaseClient,
  gameId: string,
  game: { course_id: string; game_mode: GameMode; mode_config: GameModeConfig },
  playerRows: {
    user_id: string;
    team_number: number | null;
    course_handicap: number | null;
    users: { email: string | null; name: string | null } | null;
  }[],
): Promise<FinishedMailRecipient[]> {
  const [scoresRes, holesRes] = await Promise.all([
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<
        { user_id: string; hole_number: number; strokes: number | null }[]
      >(),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<{ hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[]>(),
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
      game_mode: 'solo_strokeplay_netto',
      mode_config: game.mode_config,
    },
    players: playerRows.map((row) => ({
      userId: row.user_id,
      teamNumber: row.team_number,
      flightNumber: null,
      courseHandicap: row.course_handicap ?? 0,
    })),
    holes: (holesRes.data ?? []).map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      strokeIndex: h.stroke_index,
    })),
    scores: (scoresRes.data ?? []).map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  });

  // Defensive fallback: mode-router gav noe uventet. Fall til best-ball-copy.
  if (result.kind !== 'solo_strokeplay_netto') {
    return playerRows
      .map((row) => ({
        userId: row.user_id,
        email: row.users?.email ?? null,
        name: row.users?.name ?? null,
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
          kind: 'solo_strokeplay_netto',
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
  supabase: SupabaseClient,
  gameId: string,
  game: { course_id: string; game_mode: GameMode; mode_config: GameModeConfig },
  playerRows: {
    user_id: string;
    team_number: number | null;
    course_handicap: number | null;
    users: { email: string | null; name: string | null } | null;
  }[],
): Promise<FinishedMailRecipient[]> {
  const [scoresRes, holesRes] = await Promise.all([
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<
        { user_id: string; hole_number: number; strokes: number | null }[]
      >(),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<{ hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[]>(),
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
      game_mode: 'texas_scramble',
      mode_config: game.mode_config,
    },
    players: playerRows.map((row) => ({
      userId: row.user_id,
      teamNumber: row.team_number,
      flightNumber: null,
      courseHandicap: row.course_handicap ?? 0,
    })),
    holes: (holesRes.data ?? []).map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
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
      mode,
    });
  }
  return recipients;
}
