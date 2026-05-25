import { describe, it, expect } from 'vitest';
import { resolveScorecardLayout } from './scorecardLayout';
import type { GameForHole, PlayerForHole } from './getGameWithPlayers';

const baseGame: Omit<GameForHole, 'game_mode' | 'mode_config'> = {
  id: 'g1',
  name: 'Test',
  status: 'active',
  course_id: 'c1',
  tee_box_id: 't1',
  score_visibility: 'live',
  require_peer_approval: false,
  scheduled_tee_off_at: null,
  side_tournament_enabled: false,
  side_ld_count: 0,
  side_ctp_count: 0,
  side_disabled_categories: null,
  tee_box: {
    name: 'Hvit',
    slope_mens: 130,
    course_rating_mens: 71,
    par_total_mens: 72,
    slope_ladies: null,
    course_rating_ladies: null,
    par_total_ladies: null,
    slope_juniors: null,
    course_rating_juniors: null,
    par_total_juniors: null,
  },
};

const fmt = {
  initials: (p: PlayerForHole) =>
    (p.users?.nickname ?? p.users?.name ?? '?').slice(0, 1).toUpperCase(),
  displayName: (p: PlayerForHole, fallback: string) =>
    p.users?.nickname ?? p.users?.name ?? fallback,
};

function player(
  user_id: string,
  team_number: number,
  opts: Partial<PlayerForHole> = {},
): PlayerForHole {
  return {
    user_id,
    team_number,
    flight_number: team_number,
    course_handicap: 10,
    submitted_at: null,
    approved_at: null,
    rejection_reason: null,
    users: { name: user_id, nickname: null },
    tee_gender: 'mens',
    ...opts,
  };
}

describe('resolveScorecardLayout', () => {
  describe('Layout A (single-player)', () => {
    it('solo strokeplay → Layout A med me', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'solo_strokeplay_netto',
        mode_config: { kind: 'solo_strokeplay_netto', team_size: 1 },
      };
      const me = player('me', 1, { team_number: 0, flight_number: 0 });
      const layout = resolveScorecardLayout(game, [me], me, false, fmt);
      expect(layout.variant).toBe('a');
      expect(layout.scoreUserIds).toEqual(['me']);
      expect(layout.primaryUserId).toBe('me');
      expect(layout.primaryHandicap).toBe(10);
    });

    it('solo stableford (team_size=1) → Layout A med me', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      };
      const me = player('me', 0);
      const layout = resolveScorecardLayout(game, [me], me, false, fmt);
      expect(layout.variant).toBe('a');
      expect(layout.scoreUserIds).toEqual(['me']);
    });

    it('texas scramble → Layout A med captain (lex-min)', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'texas_scramble',
        mode_config: {
          kind: 'texas_scramble',
          team_size: 2,
          teams_count: 2,
          team_handicap_pct: 25,
        },
      };
      const me = player('zebra', 1, { course_handicap: 18 });
      const partner = player('alpha', 1, { course_handicap: 22 });
      const layout = resolveScorecardLayout(
        game,
        [me, partner],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('a');
      // alpha is lex-min, so captain
      expect(layout.scoreUserIds).toEqual(['alpha']);
      expect(layout.primaryUserId).toBe('alpha');
      // teamHandicap = round((18+22) * 25 / 100) = 10
      expect(layout.primaryHandicap).toBe(10);
    });

    it('texas scramble: non-captain ser captain-scoren (issue #17 bonus-fix)', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'texas_scramble',
        mode_config: {
          kind: 'texas_scramble',
          team_size: 2,
          teams_count: 2,
          team_handicap_pct: 25,
        },
      };
      const captain = player('aaa-captain', 1);
      const me = player('zzz-non-captain', 1);
      const layout = resolveScorecardLayout(
        game,
        [captain, me],
        me, // me er non-captain
        false,
        fmt,
      );
      expect(layout.scoreUserIds).toEqual(['aaa-captain']);
      // Før fix: scoreUserIds ville vært ['zzz-non-captain'] → tomt scorekort.
    });

    it('texas 4-mannslag: lag-handicap regnes ut riktig', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'texas_scramble',
        mode_config: {
          kind: 'texas_scramble',
          team_size: 4,
          teams_count: 2,
          team_handicap_pct: 10,
        },
      };
      const a = player('a', 1, { course_handicap: 20 });
      const b = player('b', 1, { course_handicap: 15 });
      const c = player('c', 1, { course_handicap: 30 });
      const d = player('d', 1, { course_handicap: 25 });
      const layout = resolveScorecardLayout(game, [a, b, c, d], a, false, fmt);
      // teamHandicap = round((20+15+30+25) * 10 / 100) = round(9) = 9
      expect(layout.primaryHandicap).toBe(9);
    });

    it('reveal-active → Layout A uansett modus', () => {
      const game: GameForHole = {
        ...baseGame,
        score_visibility: 'reveal',
        game_mode: 'best_ball_netto',
        mode_config: { kind: 'best_ball_netto', team_size: 2, teams_count: 4 },
      };
      const me = player('me', 1);
      const partner = player('p', 1);
      const layout = resolveScorecardLayout(
        game,
        [me, partner],
        me,
        true, // revealActive
        fmt,
      );
      expect(layout.variant).toBe('a');
      expect(layout.scoreUserIds).toEqual(['me']);
    });
  });

  describe('Layout B (multi-player)', () => {
    it('best-ball → Layout B med me + partner (samme team)', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'best_ball_netto',
        mode_config: { kind: 'best_ball_netto', team_size: 2, teams_count: 4 },
      };
      const me = player('me', 1, {
        users: { name: 'Jens Hansen', nickname: null },
      });
      const partner = player('p', 1, {
        users: { name: 'Henrik Olsen', nickname: null },
      });
      const otherTeam = player('o', 2);
      const layout = resolveScorecardLayout(
        game,
        [me, partner, otherTeam],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('b');
      expect(layout.columns).toHaveLength(2);
      expect(layout.columns[0].isCurrentUser).toBe(true);
      expect(layout.columns[0].userId).toBe('me');
      expect(layout.columns[1].isCurrentUser).toBe(false);
      expect(layout.columns[1].userId).toBe('p');
      expect(layout.scoreUserIds).toEqual(['me', 'p']);
      expect(layout.isStableford).toBe(false);
      expect(layout.isMatchplay).toBe(false);
    });

    it('par-stableford (team_size=2) → Layout B med isStableford=true', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 2, points_table: 'standard' },
      };
      const me = player('me', 1);
      const partner = player('p', 1);
      const layout = resolveScorecardLayout(
        game,
        [me, partner],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('b');
      expect(layout.isStableford).toBe(true);
      expect(layout.isMatchplay).toBe(false);
    });

    it('matchplay → Layout B med motstander (annet team_number)', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      };
      const me = player('me', 1);
      const opponent = player('opp', 2);
      const layout = resolveScorecardLayout(
        game,
        [me, opponent],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('b');
      expect(layout.columns).toHaveLength(2);
      expect(layout.columns[0].userId).toBe('me');
      expect(layout.columns[1].userId).toBe('opp');
      expect(layout.isMatchplay).toBe(true);
      expect(layout.isStableford).toBe(false);
    });

    it('best-ball uten partner i samme team → defensiv Layout A fallback', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'best_ball_netto',
        mode_config: { kind: 'best_ball_netto', team_size: 2, teams_count: 4 },
      };
      const me = player('me', 1);
      const otherTeam = player('o', 2);
      const layout = resolveScorecardLayout(
        game,
        [me, otherTeam],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('a');
      expect(layout.scoreUserIds).toEqual(['me']);
    });
  });

  describe('column ordering', () => {
    it('me-kolonnen er alltid leftmost (isCurrentUser=true)', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'best_ball_netto',
        mode_config: { kind: 'best_ball_netto', team_size: 2, teams_count: 4 },
      };
      // Partner kommer først i array
      const partner = player('p', 1);
      const me = player('me', 1);
      const layout = resolveScorecardLayout(
        game,
        [partner, me],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('b');
      expect(layout.columns[0].userId).toBe('me');
      expect(layout.columns[0].isCurrentUser).toBe(true);
    });
  });
});
