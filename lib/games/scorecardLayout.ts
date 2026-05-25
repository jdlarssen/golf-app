import { pickTeamCaptain } from './teamCaptain';
import type { GameForHole, PlayerForHole } from './getGameWithPlayers';

/**
 * Player som vises i en kolonne på Layout B. `displayName` brukes til
 * footer-totaler («Du: ... · Partner: ...»). `initial` til kolonne-headeren.
 * `courseHandicap` til netto-utregning. `isCurrentUser` styrer hvilken
 * kolonne som er leftmost.
 */
export interface ScorecardColumnPlayer {
  userId: string;
  initial: string;
  displayName: string;
  courseHandicap: number;
  isCurrentUser: boolean;
}

/**
 * Layout-spesifikasjon for scorekort-flaten.
 *
 *  - `variant: 'a'` — single-player tabell (solo-modi + Texas + reveal-fallback).
 *  - `variant: 'b'` — side-om-side (best-ball, par-stableford team, matchplay).
 *
 * `scoreUserIds` styrer hvilke user_ids vi henter scorer for. For Layout A
 * er det én (me eller captain). For Layout B er det me + partner(e) /
 * motstander. Authz-sjekk skjer på call-site (`me ∈ players`), helperen
 * gjør ingen sikkerhetsbeslutninger.
 */
export interface ScorecardLayout {
  variant: 'a' | 'b';
  /** Kolonner som rendres i Layout B. Tom for Layout A. */
  columns: ScorecardColumnPlayer[];
  /** Alle user_ids vi henter scorer for (én for solo/Texas, N for team-modi). */
  scoreUserIds: string[];
  /** Layout A: hvilken userId vi viser scorer for (én kolonne). */
  primaryUserId: string;
  /**
   * Layout A: course-handicap brukt til netto-utregning. For Texas brukes
   * lag-handicap (sum av medlemmer × pct), ikke individuell.
   */
  primaryHandicap: number;
  /** True for par-stableford (Layout B viser poeng istedenfor netto). */
  isStableford: boolean;
  /** True for matchplay (footer viser match-status istedenfor lag-total). */
  isMatchplay: boolean;
}

interface ColumnFormatter {
  initials(player: PlayerForHole): string;
  displayName(player: PlayerForHole, fallback: string): string;
}

/**
 * Bestemmer scorekort-layout basert på spillmodus, spillerlista og
 * reveal-state. Ren funksjon (ingen DB-tilgang) — call-site fetcher
 * scorer basert på `layout.scoreUserIds`.
 *
 * Regler:
 *  - Texas scramble: Layout A med captain-userId (lex-min) som primær.
 *    Lag-handicap = round(sum(member.course_handicap) × team_handicap_pct / 100).
 *  - Reveal-active (visibility=reveal + status=active): Layout A med me,
 *    uansett modus. Beholder reveal-prinsippet om å skjule andres data.
 *  - Solo-modi (stableford team_size=1, solo strokeplay): Layout A med me.
 *  - Best-ball, par-stableford (team_size=2): Layout B med me + partner
 *    på samme team_number.
 *  - Matchplay (1v1): Layout B med me + motstander (annet team_number).
 *  - Defensiv fallback: hvis team-modus mangler partner (skal ikke skje
 *    under aktivt spill) → Layout A med me.
 */
export function resolveScorecardLayout(
  game: GameForHole,
  players: PlayerForHole[],
  me: PlayerForHole,
  revealActive: boolean,
  fmt: ColumnFormatter,
): ScorecardLayout {
  const mode = game.game_mode;
  const cfg = game.mode_config;

  if (mode === 'texas_scramble') {
    const teamMembers = players.filter((p) => p.team_number === me.team_number);
    const captainId =
      teamMembers.length > 0
        ? pickTeamCaptain(teamMembers.map((m) => m.user_id))
        : me.user_id;
    const combinedCH = teamMembers.reduce(
      (sum, p) => sum + (p.course_handicap ?? 0),
      0,
    );
    const pct = cfg.kind === 'texas_scramble' ? cfg.team_handicap_pct : 0;
    const teamHandicap = Math.round((combinedCH * pct) / 100);
    return {
      variant: 'a',
      columns: [],
      scoreUserIds: [captainId],
      primaryUserId: captainId,
      primaryHandicap: teamHandicap,
      isStableford: false,
      isMatchplay: false,
    };
  }

  const isStablefordTeam =
    mode === 'stableford' && cfg.kind === 'stableford' && cfg.team_size === 2;
  const isBestBall = mode === 'best_ball_netto';
  const isMatchplay = mode === 'singles_matchplay';
  const isTeamMode = isBestBall || isStablefordTeam || isMatchplay;

  if (!isTeamMode || revealActive) {
    return {
      variant: 'a',
      columns: [],
      scoreUserIds: [me.user_id],
      primaryUserId: me.user_id,
      primaryHandicap: me.course_handicap ?? 0,
      isStableford: false,
      isMatchplay: false,
    };
  }

  const partners = isMatchplay
    ? players.filter((p) => p.team_number !== me.team_number)
    : players.filter(
        (p) =>
          p.team_number === me.team_number && p.user_id !== me.user_id,
      );

  if (partners.length === 0) {
    return {
      variant: 'a',
      columns: [],
      scoreUserIds: [me.user_id],
      primaryUserId: me.user_id,
      primaryHandicap: me.course_handicap ?? 0,
      isStableford: false,
      isMatchplay: false,
    };
  }

  const meColumn: ScorecardColumnPlayer = {
    userId: me.user_id,
    initial: fmt.initials(me),
    displayName: fmt.displayName(me, 'Du'),
    courseHandicap: me.course_handicap ?? 0,
    isCurrentUser: true,
  };
  const partnerColumns: ScorecardColumnPlayer[] = partners.map((p) => ({
    userId: p.user_id,
    initial: fmt.initials(p),
    displayName: fmt.displayName(p, isMatchplay ? 'Motstander' : 'Partner'),
    courseHandicap: p.course_handicap ?? 0,
    isCurrentUser: false,
  }));

  return {
    variant: 'b',
    columns: [meColumn, ...partnerColumns],
    scoreUserIds: [meColumn.userId, ...partnerColumns.map((p) => p.userId)],
    primaryUserId: me.user_id,
    primaryHandicap: me.course_handicap ?? 0,
    isStableford: isStablefordTeam,
    isMatchplay,
  };
}
