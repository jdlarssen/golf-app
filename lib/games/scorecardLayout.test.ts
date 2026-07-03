import { describe, it, expect } from 'vitest';
import {
  resolveScorecardLayout,
  computeLayoutBTotals,
  type LayoutBHoleInput,
  type ScorecardColumnPlayer,
} from './scorecardLayout';
import * as singlesMatchplay from '@/lib/scoring/modes/singlesMatchplay';
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from '@/lib/scoring/modes/types';
import type { GameForHole, PlayerForHole } from './getGameWithPlayers';

const baseGame: Omit<GameForHole, 'game_mode' | 'mode_config'> = {
  id: 'g1',
  name: 'Test',
  status: 'active',
  created_by: 'creator-1',
  tournament_id: null,
  league_round_id: null,
  group_id: null,
  course_id: 'c1',
  tee_box_id: 't1',
  score_visibility: 'live',
  require_peer_approval: false,
  scheduled_tee_off_at: null,
  side_tournament_enabled: false,
  side_ld_count: 0,
  side_ctp_count: 0,
  side_disabled_categories: null,
  foursomes_side1_tee_starter_user_id: null,
  foursomes_side2_tee_starter_user_id: null,
  round_report: null,
  entry_fee_kr: 0,
  payment_link: null,
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
    withdrawn_at: null,
    accepted_at: null,
    paid_at: null,
    users: { name: user_id, nickname: null, is_guest: false },
    tee_gender: 'mens',
    ...opts,
  };
}

describe('resolveScorecardLayout', () => {
  describe('Layout A (single-player)', () => {
    it('solo strokeplay → Layout A med me', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'solo_strokeplay',
        mode_config: { kind: 'solo_strokeplay', team_size: 1 },
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
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
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
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      };
      const me = player('me', 1, {
        users: { name: 'Jens Hansen', nickname: null, is_guest: false },
      });
      const partner = player('p', 1, {
        users: { name: 'Henrik Olsen', nickname: null, is_guest: false },
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

    it('par modified stableford (team_size=2) → Layout B med isStableford=true (#281)', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'modified_stableford',
        mode_config: { kind: 'modified_stableford', team_size: 2, points_table: 'modified' },
      };
      const me = player('me', 1);
      const partner = player('p', 1);
      const layout = resolveScorecardLayout(game, [me, partner], me, false, fmt);
      expect(layout.variant).toBe('b');
      expect(layout.isStableford).toBe(true);
    });

    it('fourball matchplay → Layout B med 4 kolonner (me + partner + 2 motstandere)', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'fourball_matchplay',
        mode_config: {
          kind: 'fourball_matchplay',
          team_size: 2,
          teams_count: 2,
          allowance_pct: 85,
        },
      };
      const me = player('me', 1);
      const partner = player('partner', 1);
      const opp1 = player('opp1', 2);
      const opp2 = player('opp2', 2);
      const layout = resolveScorecardLayout(
        game,
        [me, partner, opp1, opp2],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('b');
      expect(layout.columns).toHaveLength(4);
      // me først, partner ved siden av, så motstandere
      expect(layout.columns[0].userId).toBe('me');
      expect(layout.columns[0].isCurrentUser).toBe(true);
      expect(layout.columns[0].teamNumber).toBe(1);
      expect(layout.columns[1].userId).toBe('partner');
      expect(layout.columns[1].teamNumber).toBe(1);
      expect(layout.columns[2].teamNumber).toBe(2);
      expect(layout.columns[3].teamNumber).toBe(2);
      expect(layout.isFourball).toBe(true);
      expect(layout.isMatchplay).toBe(true);
      expect(layout.isStableford).toBe(false);
      expect(layout.meTeamNumber).toBe(1);
    });

    it('foursomes matchplay → Layout B med 2 kolonner (kaptein per side, lag-display)', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'foursomes_matchplay',
        mode_config: {
          kind: 'foursomes_matchplay',
          team_size: 2,
          teams_count: 2,
          allowance_pct: 50,
        },
      };
      // me=10, partner=10 (CH-sum 20); opp1=20, opp2=10 (CH-sum 30) → diff=10
      // High side = opp; high side extra = round(10 × 50/100) = 5.
      const me = player('me', 1, { course_handicap: 10 });
      const partner = player('partner', 1, { course_handicap: 10 });
      const opp1 = player('opp1', 2, { course_handicap: 20 });
      const opp2 = player('opp2', 2, { course_handicap: 10 });
      const layout = resolveScorecardLayout(
        game,
        [me, partner, opp1, opp2],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('b');
      expect(layout.columns).toHaveLength(2);
      // Kolonne 0 = me's side, kaptein = lex-min('me','partner') = 'me'
      expect(layout.columns[0].userId).toBe('me');
      expect(layout.columns[0].isCurrentUser).toBe(true);
      expect(layout.columns[0].teamNumber).toBe(1);
      expect(layout.columns[0].displayName).toBe('me/partner');
      // Lavside får 0 strokes.
      expect(layout.columns[0].courseHandicap).toBe(0);

      // Kolonne 1 = opp side, kaptein = lex-min('opp1','opp2') = 'opp1'
      expect(layout.columns[1].userId).toBe('opp1');
      expect(layout.columns[1].isCurrentUser).toBe(false);
      expect(layout.columns[1].teamNumber).toBe(2);
      expect(layout.columns[1].displayName).toBe('opp1/opp2');
      // Høyside får 5 strokes (round(|30-20| × 50/100)).
      expect(layout.columns[1].courseHandicap).toBe(5);

      expect(layout.scoreUserIds).toEqual(['me', 'opp1']);
      expect(layout.primaryUserId).toBe('me');
      expect(layout.primaryHandicap).toBe(0);
      expect(layout.isMatchplay).toBe(true);
      expect(layout.isFoursomes).toBe(true);
      expect(layout.isFourball).toBe(false);
      expect(layout.meTeamNumber).toBe(1);
    });

    it('foursomes matchplay: non-captain ser sin sides kaptein som score-eier', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'foursomes_matchplay',
        mode_config: {
          kind: 'foursomes_matchplay',
          team_size: 2,
          teams_count: 2,
          allowance_pct: 50,
        },
      };
      // me='zoe' er lex-større enn 'aaron', så aaron blir kaptein.
      // Score-input fra zoe må skrive til aaron-userId.
      const me = player('zoe', 1, { course_handicap: 15 });
      const partner = player('aaron', 1, { course_handicap: 15 });
      const opp1 = player('opp1', 2, { course_handicap: 10 });
      const opp2 = player('opp2', 2, { course_handicap: 10 });
      const layout = resolveScorecardLayout(
        game,
        [me, partner, opp1, opp2],
        me,
        false,
        fmt,
      );
      // Kaptein = 'aaron' (lex-min), så scoreUserIds = ['aaron', 'opp1'].
      expect(layout.primaryUserId).toBe('aaron');
      expect(layout.scoreUserIds).toEqual(['aaron', 'opp1']);
      // Men kolonne[0] er fortsatt isCurrentUser=true (representerer me's side).
      expect(layout.columns[0].isCurrentUser).toBe(true);
      expect(layout.columns[0].userId).toBe('aaron');
    });

    it('foursomes matchplay uten 2-2-fordeling → defensiv Layout A fallback', () => {
      const game: GameForHole = {
        ...baseGame,
        game_mode: 'foursomes_matchplay',
        mode_config: {
          kind: 'foursomes_matchplay',
          team_size: 2,
          teams_count: 2,
          allowance_pct: 50,
        },
      };
      const me = player('me', 1);
      const partner = player('partner', 1);
      // Bare 1 motstander → ikke gyldig foursomes.
      const opp = player('opp', 2);
      const layout = resolveScorecardLayout(
        game,
        [me, partner, opp],
        me,
        false,
        fmt,
      );
      expect(layout.variant).toBe('a');
      expect(layout.isFoursomes).toBe(false);
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
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
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
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
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

// ─── computeLayoutBTotals ─────────────────────────────────────────────

function par4Hole(n: number, si: number): LayoutBHoleInput {
  return { hole_number: n, par: 4, stroke_index: si };
}

function col(
  userId: string,
  ch: number,
  teamNumber: number | null = null,
): ScorecardColumnPlayer {
  return {
    userId,
    initial: userId.slice(0, 1).toUpperCase(),
    displayName: userId,
    courseHandicap: ch,
    isCurrentUser: userId === 'me',
    teamNumber,
  };
}

describe('computeLayoutBTotals', () => {
  describe('best-ball (2-mannslag)', () => {
    it('per-spiller + lag-best per hull, lag-total = sum av MIN(netto)', () => {
      const holes = [par4Hole(1, 1), par4Hole(2, 18)];
      // CH 10 → hull 1 (SI 1) får +1, hull 2 (SI 18) får +0
      // CH 6  → hull 1 (SI 1) får +1, hull 2 (SI 18) får +0
      const me = col('me', 10);
      const partner = col('p', 6);
      const scores = new Map<string, number | null>([
        // hole 1: me 5/4, partner 4/3 → bestNetto = 3
        ['me#1', 5],
        ['p#1', 4],
        // hole 2: me 4/4, partner 5/5 → bestNetto = 4
        ['me#2', 4],
        ['p#2', 5],
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, partner], {
        isStableford: false,
        isMatchplay: false,
      });
      expect(t.perPlayer[0]).toEqual({
        userId: 'me',
        holesPlayed: 2,
        brutto: 9,
        netto: 8, // 4 + 4
        points: 0,
      });
      expect(t.perPlayer[1]).toEqual({
        userId: 'p',
        holesPlayed: 2,
        brutto: 9,
        netto: 8, // 3 + 5
        points: 0,
      });
      expect(t.teamTotalNetto).toBe(7); // min(4,3)=3 + min(4,5)=4
      expect(t.playedTeamHoles).toBe(2);
      expect(t.matchStatus).toBeNull();
    });

    it('hull der ingen har skåret teller ikke', () => {
      const holes = [par4Hole(1, 1), par4Hole(2, 2)];
      const me = col('me', 0);
      const partner = col('p', 0);
      const scores = new Map<string, number | null>([
        ['me#1', 4],
        ['p#1', 5],
        // hull 2 har ingen scorer
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, partner], {
        isStableford: false,
        isMatchplay: false,
      });
      expect(t.playedTeamHoles).toBe(1);
      expect(t.teamTotalNetto).toBe(4);
    });
  });

  describe('par-stableford (team_size=2)', () => {
    it('lag-poeng = MAX(stableford-poeng) per hull', () => {
      const holes = [par4Hole(1, 18)]; // SI 18 → ingen får extra strokes
      const me = col('me', 0);
      const partner = col('p', 0);
      const scores = new Map<string, number | null>([
        // me: par-4 i 4 = par = 2 poeng
        ['me#1', 4],
        // partner: par-4 i 3 = birdie = 3 poeng
        ['p#1', 3],
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, partner], {
        isStableford: true,
        isMatchplay: false,
      });
      expect(t.perPlayer[0].points).toBe(2);
      expect(t.perPlayer[1].points).toBe(3);
      expect(t.teamTotalPoints).toBe(3); // MAX(2, 3)
    });

    it('netto-felt fylles uavhengig av stableford-modus', () => {
      const holes = [par4Hole(1, 18)];
      const me = col('me', 0);
      const partner = col('p', 0);
      const scores = new Map<string, number | null>([
        ['me#1', 5],
        ['p#1', 4],
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, partner], {
        isStableford: true,
        isMatchplay: false,
      });
      expect(t.perPlayer[0].netto).toBe(5);
      expect(t.perPlayer[1].netto).toBe(4);
    });

    it('bruker modified-tabellen når pointsFn er satt → negative poeng (#281)', () => {
      const holes = [par4Hole(1, 18)]; // SI 18 → ingen extra strokes
      const me = col('me', 0);
      const partner = col('p', 0);
      const scores = new Map<string, number | null>([
        ['me#1', 5], // bogey → modified −1 (standard ville gitt 1)
        ['p#1', 6], // dobbeltbogey → modified −3 (standard ville gitt 0)
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, partner], {
        isStableford: true,
        isMatchplay: false,
        pointsFn: computeModifiedStablefordPoints,
      });
      expect(t.perPlayer[0].points).toBe(-1);
      expect(t.perPlayer[1].points).toBe(-3);
      expect(t.teamTotalPoints).toBe(-1); // MAX(−1, −3)
    });
  });

  describe('matchplay (1v1)', () => {
    it('beregner holes-up + format «X up etter N hull»', () => {
      const holes = [par4Hole(1, 18), par4Hole(2, 18), par4Hole(3, 18)];
      const me = col('me', 0);
      const opp = col('opp', 0);
      const scores = new Map<string, number | null>([
        ['me#1', 4],
        ['opp#1', 5], // me vinner
        ['me#2', 5],
        ['opp#2', 4], // opp vinner
        ['me#3', 4],
        ['opp#3', 5], // me vinner
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, opp], {
        isStableford: false,
        isMatchplay: true,
      });
      expect(t.matchStatus).toBe('Du er 1 up etter 3 hull');
    });

    it('AS når likt antall vundne hull', () => {
      const holes = [par4Hole(1, 18), par4Hole(2, 18)];
      const me = col('me', 0);
      const opp = col('opp', 0);
      const scores = new Map<string, number | null>([
        ['me#1', 4],
        ['opp#1', 5], // me vinner
        ['me#2', 5],
        ['opp#2', 4], // opp vinner
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, opp], {
        isStableford: false,
        isMatchplay: true,
      });
      expect(t.matchStatus).toBe('AS (2 hull spilt)');
    });

    it('«Du er X down» når motstander leder', () => {
      const holes = [par4Hole(1, 18), par4Hole(2, 18)];
      const me = col('me', 0);
      const opp = col('opp', 0);
      const scores = new Map<string, number | null>([
        ['me#1', 5],
        ['opp#1', 4], // opp vinner
        ['me#2', 5],
        ['opp#2', 4], // opp vinner
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, opp], {
        isStableford: false,
        isMatchplay: true,
      });
      expect(t.matchStatus).toBe('Du er 2 down etter 2 hull');
    });

    it('uplayed hull (én side mangler) teller ikke', () => {
      const holes = [par4Hole(1, 18), par4Hole(2, 18)];
      const me = col('me', 0);
      const opp = col('opp', 0);
      const scores = new Map<string, number | null>([
        ['me#1', 4],
        ['opp#1', 5], // me vinner
        ['me#2', 4],
        // opp har ikke skåret hull 2 → unplayed
      ]);
      const t = computeLayoutBTotals(holes, scores, [me, opp], {
        isStableford: false,
        isMatchplay: true,
      });
      expect(t.matchStatus).toBe('Du er 1 up etter 1 hull');
    });

    it('«Ingen hull spilt» når begge sider mangler scorer', () => {
      const holes = [par4Hole(1, 18)];
      const me = col('me', 0);
      const opp = col('opp', 0);
      const scores = new Map<string, number | null>();
      const t = computeLayoutBTotals(holes, scores, [me, opp], {
        isStableford: false,
        isMatchplay: true,
      });
      expect(t.matchStatus).toBe('Ingen hull spilt ennå');
    });
  });

  describe('fourball matchplay (2v2)', () => {
    it('lag-best per side avgjør hull-vinner og match-status (me-lag leder)', () => {
      const holes = [par4Hole(1, 18), par4Hole(2, 18), par4Hole(3, 18)];
      // SI 18 → ingen får extra strokes; matchen er på brutto.
      const me = col('me', 0, 1);
      const partner = col('partner', 0, 1);
      const opp1 = col('opp1', 0, 2);
      const opp2 = col('opp2', 0, 2);
      const scores = new Map<string, number | null>([
        // Hull 1: me 5, partner 4 → me-side-best = 4
        //        opp1 5, opp2 5 → opp-side-best = 5 → me-side vinner
        ['me#1', 5],
        ['partner#1', 4],
        ['opp1#1', 5],
        ['opp2#1', 5],
        // Hull 2: me 5, partner 6 → me-side-best = 5
        //        opp1 4, opp2 6 → opp-side-best = 4 → opp-side vinner
        ['me#2', 5],
        ['partner#2', 6],
        ['opp1#2', 4],
        ['opp2#2', 6],
        // Hull 3: me 4, partner 5 → me-side-best = 4
        //        opp1 5, opp2 4 → opp-side-best = 4 → tied
        ['me#3', 4],
        ['partner#3', 5],
        ['opp1#3', 5],
        ['opp2#3', 4],
      ]);
      const t = computeLayoutBTotals(
        holes,
        scores,
        [me, partner, opp1, opp2],
        { isStableford: false, isMatchplay: true, isFourball: true, meTeamNumber: 1 },
      );
      // me-side vant 1, opp-side vant 1, 1 tied → holesUp = 0, 3 hull spilt.
      expect(t.matchStatus).toBe('AS (3 hull spilt)');
    });

    it('viser «Laget ditt er X up» når me-lag leder', () => {
      const holes = [par4Hole(1, 18), par4Hole(2, 18)];
      const me = col('me', 0, 1);
      const partner = col('partner', 0, 1);
      const opp1 = col('opp1', 0, 2);
      const opp2 = col('opp2', 0, 2);
      const scores = new Map<string, number | null>([
        ['me#1', 4],
        ['partner#1', 5],
        ['opp1#1', 5],
        ['opp2#1', 6],
        ['me#2', 4],
        ['partner#2', 5],
        ['opp1#2', 5],
        ['opp2#2', 6],
      ]);
      const t = computeLayoutBTotals(
        holes,
        scores,
        [me, partner, opp1, opp2],
        { isStableford: false, isMatchplay: true, isFourball: true, meTeamNumber: 1 },
      );
      expect(t.matchStatus).toBe('Laget ditt er 2 up etter 2 hull');
    });

    it('viser «Laget ditt er X down» når motstanderne leder', () => {
      const holes = [par4Hole(1, 18)];
      const me = col('me', 0, 1);
      const partner = col('partner', 0, 1);
      const opp1 = col('opp1', 0, 2);
      const opp2 = col('opp2', 0, 2);
      const scores = new Map<string, number | null>([
        ['me#1', 5],
        ['partner#1', 5],
        ['opp1#1', 4],
        ['opp2#1', 5],
      ]);
      const t = computeLayoutBTotals(
        holes,
        scores,
        [me, partner, opp1, opp2],
        { isStableford: false, isMatchplay: true, isFourball: true, meTeamNumber: 1 },
      );
      expect(t.matchStatus).toBe('Laget ditt er 1 down etter 1 hull');
    });

    it('hull med kun én partner-score teller fortsatt for sin side (best-ball-konvensjon)', () => {
      const holes = [par4Hole(1, 18)];
      const me = col('me', 0, 1);
      const partner = col('partner', 0, 1);
      const opp1 = col('opp1', 0, 2);
      const opp2 = col('opp2', 0, 2);
      // Bare me har score på lag 1 (partner mangler), begge motstandere har.
      // Best-ball: én partner med gross holder for at siden teller.
      const scores = new Map<string, number | null>([
        ['me#1', 4],
        // partner#1 unplayed
        ['opp1#1', 5],
        ['opp2#1', 5],
      ]);
      const t = computeLayoutBTotals(
        holes,
        scores,
        [me, partner, opp1, opp2],
        { isStableford: false, isMatchplay: true, isFourball: true, meTeamNumber: 1 },
      );
      // me-side-best = 4 (me alene), opp-side-best = 5 → me-side vinner.
      expect(t.matchStatus).toBe('Laget ditt er 1 up etter 1 hull');
    });
  });

  // ─── Roundtrip-test: scorekort vs singlesMatchplay.compute ──────────────
  //
  // Issue #205: scorekortet hadde tidligere sin egen inline matchplay-
  // tally-logikk. Etter refactoren bruker den `computeMatchplayRunningStatus`
  // som compute() også speiler via shared `classifyMatchplayHole`. Denne
  // testen garanterer at de to call-sites returnerer SAMME holesUp +
  // holesPlayed for et set fixture-runder med blandede utfall (me-win,
  // opp-win, tied, unplayed). Hvis matchplay-domenet utvides og en av
  // call-sites driver fra den andre, fanger denne testen det.
  describe('roundtrip: scorekort vs singlesMatchplay.compute (issue #205)', () => {
    it('returnerer samme holesUp + holesPlayed for fixture-runde med blandede utfall', () => {
      // Fixture: 5 hull med ulike utfall.
      //  - hull 1 (SI 1):  me 5/4, opp 6/5 → me vinner (begge får +1 stroke)
      //  - hull 2 (SI 18): me 4/4, opp 4/4 → tied (ingen får ekstra på SI 18)
      //  - hull 3 (SI 5):  me 6/5, opp 5/4 → opp vinner
      //  - hull 4 (SI 9):  me 4/3, opp null → unplayed (ikke spilt av opp)
      //  - hull 5 (SI 2):  me 5/4, opp 4/3 → opp vinner
      // Forventet: holesUp = 1 - 2 = -1, holesPlayed = 4 (hull 4 er unplayed).
      const layoutHoles: LayoutBHoleInput[] = [
        { hole_number: 1, par: 4, stroke_index: 1 },
        { hole_number: 2, par: 4, stroke_index: 18 },
        { hole_number: 3, par: 4, stroke_index: 5 },
        { hole_number: 4, par: 4, stroke_index: 9 },
        { hole_number: 5, par: 4, stroke_index: 2 },
      ];
      const meCol = col('me', 10);
      const oppCol = col('opp', 10);
      const scores = new Map<string, number | null>([
        ['me#1', 5],
        ['opp#1', 6],
        ['me#2', 4],
        ['opp#2', 4],
        ['me#3', 6],
        ['opp#3', 5],
        ['me#4', 4],
        // opp#4 unplayed
        ['me#5', 5],
        ['opp#5', 4],
      ]);

      const scorecardResult = computeLayoutBTotals(layoutHoles, scores, [meCol, oppCol], {
        isStableford: false,
        isMatchplay: true,
      });

      // Bygg ekvivalent ScoringContext og kjør compute().
      const scoringHoles: ScoringHole[] = layoutHoles.map((h) => ({
        number: h.hole_number,
        par: h.par,
        strokeIndex: h.stroke_index,
      }));
      const scoringPlayers: ScoringPlayer[] = [
        { userId: 'me', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'opp', teamNumber: 2, flightNumber: 1, courseHandicap: 10 },
      ];
      const scoringScores: ScoringHoleScore[] = [];
      for (const [key, gross] of scores) {
        const [userId, holeStr] = key.split('#');
        scoringScores.push({ userId, holeNumber: Number(holeStr), gross });
      }
      const ctx: ScoringContext = {
        game: {
          id: 'g1',
          game_mode: 'singles_matchplay',
          mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
        },
        players: scoringPlayers,
        holes: scoringHoles,
        scores: scoringScores,
      };
      const computeResult = singlesMatchplay.compute(ctx);

      // Forventet utfall: opp leder med 1 etter 4 spilte hull.
      expect(computeResult.holesPlayed).toBe(4);
      expect(computeResult.holesUp).toBe(-1); // side1 (me) − side2 (opp) = 1 − 2 = −1
      // Scorekort-stringen reflekterer samme tall (sett fra me's side):
      expect(scorecardResult.matchStatus).toBe('Du er 1 down etter 4 hull');
    });

    it('returnerer samme tall når matchen står AS midt i runden', () => {
      // 3 hull, hver side vinner ett, ett tied → holesPlayed=3, holesUp=0.
      const layoutHoles: LayoutBHoleInput[] = [
        { hole_number: 1, par: 4, stroke_index: 18 },
        { hole_number: 2, par: 4, stroke_index: 18 },
        { hole_number: 3, par: 4, stroke_index: 18 },
      ];
      const meCol = col('me', 0);
      const oppCol = col('opp', 0);
      const scores = new Map<string, number | null>([
        ['me#1', 4],
        ['opp#1', 5], // me vinner
        ['me#2', 5],
        ['opp#2', 4], // opp vinner
        ['me#3', 4],
        ['opp#3', 4], // tied
      ]);

      const scorecardResult = computeLayoutBTotals(layoutHoles, scores, [meCol, oppCol], {
        isStableford: false,
        isMatchplay: true,
      });

      const ctx: ScoringContext = {
        game: {
          id: 'g1',
          game_mode: 'singles_matchplay',
          mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
        },
        players: [
          { userId: 'me', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
          { userId: 'opp', teamNumber: 2, flightNumber: 1, courseHandicap: 0 },
        ],
        holes: layoutHoles.map((h) => ({
          number: h.hole_number,
          par: h.par,
          strokeIndex: h.stroke_index,
        })),
        scores: [
          { userId: 'me', holeNumber: 1, gross: 4 },
          { userId: 'opp', holeNumber: 1, gross: 5 },
          { userId: 'me', holeNumber: 2, gross: 5 },
          { userId: 'opp', holeNumber: 2, gross: 4 },
          { userId: 'me', holeNumber: 3, gross: 4 },
          { userId: 'opp', holeNumber: 3, gross: 4 },
        ],
      };
      const computeResult = singlesMatchplay.compute(ctx);

      expect(computeResult.holesPlayed).toBe(3);
      expect(computeResult.holesUp).toBe(0);
      expect(scorecardResult.matchStatus).toBe('AS (3 hull spilt)');
    });
  });
});
