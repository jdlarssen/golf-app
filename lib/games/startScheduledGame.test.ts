import { describe, it, expect } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { startScheduledGame } from './startScheduledGame';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Unit-tester for startScheduledGame (#544 — incomplete_sides-vakt,
 * #502 — started-flagg).
 *
 * Fokus: verifiser at alle 6 matchplay-modi blokkeres med `incomplete_sides`
 * når sidene er ufullstendige, og at komplette sider passerer til vanlig
 * tee-box-sjekk. Eksisterende reasons (no_players, pending_players osv.)
 * er ikke re-testet her — de er dekket i integrerende tester per call-site.
 *
 * #502: `started` skiller calleren som vant status-flippen (skal fan-oute
 * game_started-varsler) fra no-op-tapere i kappløp (cron vs. E1 vs. admin).
 */

// Gyldige tee-box-rader (alle tre ratingssett). Brukes i success-path der
// vi ikke vil at tee-mangling skal skjule incomplete_sides-logikken.
const VALID_TEE = {
  slope_mens: 113,
  course_rating_mens: 72.0,
  par_total_mens: 72,
  slope_ladies: 113,
  course_rating_ladies: 72.0,
  par_total_ladies: 72,
  slope_juniors: 113,
  course_rating_juniors: 72.0,
  par_total_juniors: 72,
};

// Bruker-rad med fullstendig profil og lav hcp
const PLAYER = (userId: string, team_number: number | null = 1) => ({
  user_id: userId,
  tee_gender: 'M' as const,
  team_number,
  withdrawn_at: null,
  users: { hcp_index: 10 },
});

function makeGameRow(
  game_mode: GameMode,
  team_size: number,
  withTee = true,
) {
  return {
    id: 'game-id',
    status: 'scheduled',
    hcp_allowance_pct: 100,
    tee_box_id: 'tee-id',
    game_mode,
    mode_config: { kind: game_mode, team_size, teams_count: 2 },
    tee_boxes: withTee ? VALID_TEE : null,
  };
}

// ─── incomplete_sides guard ───────────────────────────────────────────────────

describe('startScheduledGame — incomplete_sides guard', () => {
  it.each<[GameMode, number]>([
    ['singles_matchplay', 1],
    ['fourball_matchplay', 2],
    ['foursomes_matchplay', 2],
    ['greensome_matchplay', 2],
    ['chapman_matchplay', 2],
    ['gruesome_matchplay', 2],
  ])(
    '%s: side 2 mangler spiller → incomplete_sides',
    async (mode, teamSize) => {
      // Roster: side 1 full, side 2 tom
      const rosterRows = Array.from({ length: teamSize }, (_, i) =>
        PLAYER(`user-${i}`, 1),
      );

      const supabase = buildSupabaseMock([
        // 1) game row
        { data: makeGameRow(mode, teamSize), error: null },
        // 2) game_players (roster)
        { data: rosterRows, error: null },
      ]);

      const result = await startScheduledGame(supabase as never, 'game-id');
      expect(result).toEqual({ ok: false, reason: 'incomplete_sides' });
    },
  );

  it.each<[GameMode, number]>([
    ['singles_matchplay', 1],
    ['fourball_matchplay', 2],
    ['foursomes_matchplay', 2],
    ['greensome_matchplay', 2],
    ['chapman_matchplay', 2],
    ['gruesome_matchplay', 2],
  ])(
    '%s: spiller med null team_number blokkerer → incomplete_sides',
    async (mode, teamSize) => {
      // Roster: side 1 full, ett null-team (sign-up uten side)
      const rosterRows = [
        ...Array.from({ length: teamSize }, (_, i) => PLAYER(`user-${i}`, 1)),
        PLAYER('null-player', null), // mangler side
        ...Array.from({ length: teamSize }, (_, i) =>
          PLAYER(`user-side2-${i}`, 2),
        ),
      ];

      const supabase = buildSupabaseMock([
        { data: makeGameRow(mode, teamSize), error: null },
        { data: rosterRows, error: null },
      ]);

      const result = await startScheduledGame(supabase as never, 'game-id');
      expect(result).toEqual({ ok: false, reason: 'incomplete_sides' });
    },
  );

  it.each<[GameMode, number]>([
    ['singles_matchplay', 1],
    ['fourball_matchplay', 2],
    ['foursomes_matchplay', 2],
    ['greensome_matchplay', 2],
    ['chapman_matchplay', 2],
    ['gruesome_matchplay', 2],
  ])(
    '%s: trukkede spillere teller ikke — side ufullstendig → incomplete_sides',
    async (mode, teamSize) => {
      // Roster: side 1 full, side 2 har én trukket og ikke nok aktive
      const rosterRows = [
        ...Array.from({ length: teamSize }, (_, i) => PLAYER(`user-${i}`, 1)),
        // side 2: alle trukket
        { ...PLAYER('withdrawn-1', 2), withdrawn_at: '2026-01-01T00:00:00Z' },
      ];

      const supabase = buildSupabaseMock([
        { data: makeGameRow(mode, teamSize), error: null },
        { data: rosterRows, error: null },
      ]);

      const result = await startScheduledGame(supabase as never, 'game-id');
      expect(result).toEqual({ ok: false, reason: 'incomplete_sides' });
    },
  );

  it('singles_matchplay komplett (1v1) → fortsetter til pending_players-sjekk', async () => {
    // Roster: 1 aktiv per side, begge med fullstendig profil
    const rosterRows = [PLAYER('user-1', 1), PLAYER('user-2', 2)];

    // Supabase-kall etter incomplete_sides-sjekken:
    //   3) users (profile_completed_at) → begge fullstendige
    //   4+5) course_handicap updates
    //   6) status flip
    const supabase = buildSupabaseMock([
      // 1) game row
      { data: makeGameRow('singles_matchplay', 1), error: null },
      // 2) game_players
      { data: rosterRows, error: null },
      // 3) users — begge fullstendige
      {
        data: [
          { id: 'user-1', email: 'a@x.no', profile_completed_at: '2026-01-01' },
          { id: 'user-2', email: 'b@x.no', profile_completed_at: '2026-01-01' },
        ],
        error: null,
      },
      // 4) course_handicap update user-1
      { data: null, error: null },
      // 5) course_handicap update user-2
      { data: null, error: null },
      // 6) status flip — vant raden (1 rad tilbake fra .select('id'))
      { data: [{ id: 'game-id' }], error: null },
    ]);

    const result = await startScheduledGame(supabase as never, 'game-id');
    expect(result).toEqual({ ok: true, started: true });
  });

  it('non-matchplay mode (stableford) ignorerer side-guard', async () => {
    // For stableford med team_number=null ignoreres vakta, så spillet
    // kan starte uten side-tilordning.
    const rosterRows = [
      {
        user_id: 'user-1',
        tee_gender: 'M',
        team_number: null,
        withdrawn_at: null,
        users: { hcp_index: 10 },
      },
    ];

    const supabase = buildSupabaseMock([
      // 1) game row — stableford
      {
        data: {
          id: 'game-id',
          status: 'scheduled',
          hcp_allowance_pct: 100,
          tee_box_id: 'tee-id',
          game_mode: 'stableford',
          mode_config: { kind: 'stableford', team_size: 1 },
          tee_boxes: VALID_TEE,
        },
        error: null,
      },
      // 2) game_players
      { data: rosterRows, error: null },
      // 3) users
      {
        data: [
          { id: 'user-1', email: 'a@x.no', profile_completed_at: '2026-01-01' },
        ],
        error: null,
      },
      // 4) course_handicap update
      { data: null, error: null },
      // 5) status flip — vant raden
      { data: [{ id: 'game-id' }], error: null },
    ]);

    const result = await startScheduledGame(supabase as never, 'game-id');
    expect(result).toEqual({ ok: true, started: true });
  });
});

// ─── started-flagg (#502) ─────────────────────────────────────────────────────

describe('startScheduledGame — started-flagg', () => {
  const SOLO_GAME = {
    id: 'game-id',
    status: 'scheduled',
    hcp_allowance_pct: 100,
    tee_box_id: 'tee-id',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1 },
    tee_boxes: VALID_TEE,
  };
  const SOLO_ROSTER = [
    {
      user_id: 'user-1',
      tee_gender: 'M',
      team_number: null,
      withdrawn_at: null,
      users: { hcp_index: 10 },
    },
  ];
  const SOLO_USERS = [
    { id: 'user-1', email: 'a@x.no', profile_completed_at: '2026-01-01' },
  ];

  it('konkurrent tapte flippen (0 rader fra optimistisk lås) → started: false', async () => {
    const supabase = buildSupabaseMock([
      { data: SOLO_GAME, error: null },
      { data: SOLO_ROSTER, error: null },
      { data: SOLO_USERS, error: null },
      // course_handicap update
      { data: null, error: null },
      // status flip — en annen caller vant; .eq('status','scheduled') matchet 0 rader
      { data: [], error: null },
    ]);

    const result = await startScheduledGame(supabase as never, 'game-id');
    expect(result).toEqual({ ok: true, started: false });
  });

  it('spill allerede aktivt ved lesing → ok uten started', async () => {
    const supabase = buildSupabaseMock([
      { data: { ...SOLO_GAME, status: 'active' }, error: null },
    ]);

    const result = await startScheduledGame(supabase as never, 'game-id');
    expect(result).toEqual({ ok: true, started: false });
  });
});
