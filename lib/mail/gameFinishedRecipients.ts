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

  // Best-ball-netto: ingen per-spiller-mode, returner kun email+name.
  if (game.game_mode !== 'stableford') {
    return playerRows
      .map((row) => ({
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
      .select('hole_number, par, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<{ hole_number: number; par: number; stroke_index: number }[]>(),
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
      par: h.par,
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
      email,
      name: row.users?.name ?? null,
      mode,
    });
  }
  return recipients;
}
