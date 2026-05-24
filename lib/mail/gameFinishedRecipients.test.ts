import { describe, it, expect, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { buildGameFinishedRecipients } from './gameFinishedRecipients';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

beforeEach(() => {
  // intentional: vitest resets mocks via vi.clearAllMocks() in any other
  // setupFile if needed — these tests use buildSupabaseMock per-case so
  // nothing leaks between tests.
});

const BEST_BALL_CONFIG: GameModeConfig = {
  kind: 'best_ball_netto',
  team_size: 2,
  teams_count: 4,
};

const STABLEFORD_CONFIG: GameModeConfig = {
  kind: 'stableford',
  team_size: 1,
  points_table: 'standard',
};

describe('buildGameFinishedRecipients', () => {
  it('best_ball_netto: returnerer email/name uten mode-info', async () => {
    const supabase = buildSupabaseMock([
      {
        // game_players-fetchen (eneste queryen for best-ball)
        data: [
          {
            user_id: 'u1',
            team_number: null,
            course_handicap: 18,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            user_id: 'u2',
            team_number: null,
            course_handicap: 14,
            users: { email: 'b@example.com', name: 'Bjørn' },
          },
        ],
        error: null,
      },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-1',
      {
        course_id: 'c1',
        game_mode: 'best_ball_netto',
        mode_config: BEST_BALL_CONFIG,
      },
    );

    expect(recipients).toHaveLength(2);
    expect(recipients[0]).toEqual({ email: 'a@example.com', name: 'Ada' });
    expect(recipients[1]).toEqual({ email: 'b@example.com', name: 'Bjørn' });
    expect(recipients.every((r) => r.mode === undefined)).toBe(true);
  });

  it('best_ball_netto: dropper spillere uten email', async () => {
    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: null,
            course_handicap: 18,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            user_id: 'u2',
            team_number: null,
            course_handicap: 14,
            users: { email: null, name: 'Bjørn uten email' }, // dropp
          },
          {
            user_id: 'u3',
            team_number: null,
            course_handicap: 10,
            users: null, // dropp
          },
        ],
        error: null,
      },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-1',
      {
        course_id: 'c1',
        game_mode: 'best_ball_netto',
        mode_config: BEST_BALL_CONFIG,
      },
    );

    expect(recipients).toHaveLength(1);
    expect(recipients[0]!.email).toBe('a@example.com');
  });

  it('stableford: regner ut rank + poeng per spiller og legger på mode-info', async () => {
    // To spillere, 2 hull, alle par 4, ingen ekstra-slag (CH=0):
    //   u1: gross 4, 3 → netto par + birdie → 2 + 3 = 5 poeng
    //   u2: gross 5, 4 → netto bogey + par → 1 + 2 = 3 poeng
    const supabase = buildSupabaseMock([
      {
        // game_players-fetchen
        data: [
          {
            user_id: 'u1',
            team_number: null,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            user_id: 'u2',
            team_number: null,
            course_handicap: 0,
            users: { email: 'b@example.com', name: 'Bjørn' },
          },
        ],
        error: null,
      },
      {
        // scores-fetchen (Promise.all → første)
        data: [
          { user_id: 'u1', hole_number: 1, strokes: 4 },
          { user_id: 'u1', hole_number: 2, strokes: 3 },
          { user_id: 'u2', hole_number: 1, strokes: 5 },
          { user_id: 'u2', hole_number: 2, strokes: 4 },
        ],
        error: null,
      },
      {
        // course_holes-fetchen (Promise.all → andre)
        data: [
          { hole_number: 1, par: 4, stroke_index: 1 },
          { hole_number: 2, par: 4, stroke_index: 2 },
        ],
        error: null,
      },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-1',
      {
        course_id: 'c1',
        game_mode: 'stableford',
        mode_config: STABLEFORD_CONFIG,
      },
    );

    expect(recipients).toHaveLength(2);
    const u1 = recipients.find((r) => r.email === 'a@example.com');
    const u2 = recipients.find((r) => r.email === 'b@example.com');
    expect(u1?.mode).toEqual({
      kind: 'stableford',
      variant: 'solo',
      rank: 1,
      totalPoints: 5,
      totalPlayers: 2,
    });
    expect(u2?.mode).toEqual({
      kind: 'stableford',
      variant: 'solo',
      rank: 2,
      totalPoints: 3,
      totalPlayers: 2,
    });
  });

  it('stableford: dropper spillere uten email (mode-info gjelder kun rendret resultat)', async () => {
    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: null,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            user_id: 'u2',
            team_number: null,
            course_handicap: 0,
            users: null, // dropp
          },
        ],
        error: null,
      },
      {
        data: [
          { user_id: 'u1', hole_number: 1, strokes: 4 },
          { user_id: 'u2', hole_number: 1, strokes: 5 },
        ],
        error: null,
      },
      {
        data: [{ hole_number: 1, par: 4, stroke_index: 1 }],
        error: null,
      },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-1',
      {
        course_id: 'c1',
        game_mode: 'stableford',
        mode_config: STABLEFORD_CONFIG,
      },
    );

    expect(recipients).toHaveLength(1);
    // totalPlayers reflekterer FULL turnering (2), ikke kun de med mail.
    expect(recipients[0]!.mode).toMatchObject({
      kind: 'stableford',
      variant: 'solo',
      totalPlayers: 2,
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Par-stableford (team_size: 2) — bygger per-spiller mottakerliste
  // med lag-rank + partnernavn. Hver spiller på et lag får SAMME
  // teamRank/teamTotalPoints men sin egen partner-name.
  // ────────────────────────────────────────────────────────────────

  const TEAM_STABLEFORD_CONFIG: GameModeConfig = {
    kind: 'stableford',
    team_size: 2,
    points_table: 'standard',
  };

  it('team-stableford: 4 spillere på 2 lag — alle får mail med team-payload', async () => {
    // Lag 1 (u1+u2) og lag 2 (u3+u4), 1 hull par 4, CH=0:
    //   u1 gross 3 → birdie → 3 poeng; u2 gross 4 → par → 2 poeng → lag 1 teamPoints = 3
    //   u3 gross 5 → bogey → 1 poeng; u4 gross 4 → par → 2 poeng → lag 2 teamPoints = 2
    // → Lag 1 vinner (rank 1), Lag 2 (rank 2).
    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'ada@example.com', name: 'Ada Olsen' },
          },
          {
            user_id: 'u2',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'bjorn@example.com', name: 'Bjørn Hansen' },
          },
          {
            user_id: 'u3',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'cecilie@example.com', name: 'Cecilie Berg' },
          },
          {
            user_id: 'u4',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'david@example.com', name: 'David Knutsen' },
          },
        ],
        error: null,
      },
      {
        data: [
          { user_id: 'u1', hole_number: 1, strokes: 3 },
          { user_id: 'u2', hole_number: 1, strokes: 4 },
          { user_id: 'u3', hole_number: 1, strokes: 5 },
          { user_id: 'u4', hole_number: 1, strokes: 4 },
        ],
        error: null,
      },
      {
        data: [{ hole_number: 1, par: 4, stroke_index: 1 }],
        error: null,
      },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-1',
      {
        course_id: 'c1',
        game_mode: 'stableford',
        mode_config: TEAM_STABLEFORD_CONFIG,
      },
    );

    expect(recipients).toHaveLength(4);

    // Lag 1 — vinneren. Ada og Bjørn har hverandre som partner.
    const ada = recipients.find((r) => r.email === 'ada@example.com');
    const bjorn = recipients.find((r) => r.email === 'bjorn@example.com');
    expect(ada?.mode).toEqual({
      kind: 'stableford',
      variant: 'team',
      teamRank: 1,
      teamTotalPoints: 3,
      teamPartnerName: 'Bjørn', // partnerens fornavn
      totalTeams: 2,
    });
    expect(bjorn?.mode).toEqual({
      kind: 'stableford',
      variant: 'team',
      teamRank: 1,
      teamTotalPoints: 3,
      teamPartnerName: 'Ada', // partnerens fornavn
      totalTeams: 2,
    });

    // Lag 2 — rank 2. Cecilie og David er partnere.
    const cecilie = recipients.find((r) => r.email === 'cecilie@example.com');
    const david = recipients.find((r) => r.email === 'david@example.com');
    expect(cecilie?.mode).toEqual({
      kind: 'stableford',
      variant: 'team',
      teamRank: 2,
      teamTotalPoints: 2,
      teamPartnerName: 'David',
      totalTeams: 2,
    });
    expect(david?.mode).toEqual({
      kind: 'stableford',
      variant: 'team',
      teamRank: 2,
      teamTotalPoints: 2,
      teamPartnerName: 'Cecilie',
      totalTeams: 2,
    });
  });

  it('team-stableford: totalTeams reflekterer antall lag i resultatet (ikke spillere)', async () => {
    // 4 lag à 2 spillere = 8 spillere, men totalTeams skal være 4 (ikke 8).
    const players = Array.from({ length: 8 }, (_, i) => ({
      user_id: `u${i + 1}`,
      team_number: Math.floor(i / 2) + 1, // 1,1,2,2,3,3,4,4
      course_handicap: 0,
      users: {
        email: `u${i + 1}@example.com`,
        name: `Spiller ${i + 1}`,
      },
    }));
    const scores = players.map((p) => ({
      user_id: p.user_id,
      hole_number: 1,
      strokes: 4, // alle får par = 2 poeng → alle lag teamPoints=2
    }));

    const supabase = buildSupabaseMock([
      { data: players, error: null },
      { data: scores, error: null },
      {
        data: [{ hole_number: 1, par: 4, stroke_index: 1 }],
        error: null,
      },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-1',
      {
        course_id: 'c1',
        game_mode: 'stableford',
        mode_config: TEAM_STABLEFORD_CONFIG,
      },
    );

    expect(recipients).toHaveLength(8);
    for (const r of recipients) {
      expect(r.mode).toMatchObject({
        kind: 'stableford',
        variant: 'team',
        totalTeams: 4,
      });
    }
  });

  it('team-stableford: dropper spillere uten email, men beholder team-totaler', async () => {
    // Lag 1 (u1+u2 hvor u2 mangler email), lag 2 (u3+u4). 1 hull par 4.
    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Ada Olsen' },
          },
          {
            user_id: 'u2',
            team_number: 1,
            course_handicap: 0,
            users: { email: null, name: 'Bjørn Hansen' }, // ingen mail
          },
          {
            user_id: 'u3',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'c@example.com', name: 'Cecilie Berg' },
          },
          {
            user_id: 'u4',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'd@example.com', name: 'David Knutsen' },
          },
        ],
        error: null,
      },
      {
        data: [
          { user_id: 'u1', hole_number: 1, strokes: 4 },
          { user_id: 'u2', hole_number: 1, strokes: 4 },
          { user_id: 'u3', hole_number: 1, strokes: 4 },
          { user_id: 'u4', hole_number: 1, strokes: 4 },
        ],
        error: null,
      },
      {
        data: [{ hole_number: 1, par: 4, stroke_index: 1 }],
        error: null,
      },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-1',
      {
        course_id: 'c1',
        game_mode: 'stableford',
        mode_config: TEAM_STABLEFORD_CONFIG,
      },
    );

    // 3 mottakere (u2 droppet pga manglende mail), men 2 lag i totaltallene.
    expect(recipients).toHaveLength(3);
    const ada = recipients.find((r) => r.email === 'a@example.com');
    // Ada beholder lag 1-konteksten + partnernavnet selv om partner ikke får mail.
    expect(ada?.mode).toEqual({
      kind: 'stableford',
      variant: 'team',
      teamRank: 1, // tied — begge lag har 2 poeng → minste rank først
      teamTotalPoints: 2,
      teamPartnerName: 'Bjørn',
      totalTeams: 2,
    });
  });

  it('team-stableford: faller tilbake til partnernavn=null hvis partner mangler navn', async () => {
    // Edge-case: en spiller på laget har null `name` (pre-completion-profile).
    // Da returnerer firstName(null) = null, og mailen skal droppe partner-
    // setningen heller enn å si «Du og null satt sammen».
    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Ada Olsen' },
          },
          {
            user_id: 'u2',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'b@example.com', name: null }, // ingen navn
          },
        ],
        error: null,
      },
      {
        data: [
          { user_id: 'u1', hole_number: 1, strokes: 4 },
          { user_id: 'u2', hole_number: 1, strokes: 4 },
        ],
        error: null,
      },
      {
        data: [{ hole_number: 1, par: 4, stroke_index: 1 }],
        error: null,
      },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-1',
      {
        course_id: 'c1',
        game_mode: 'stableford',
        mode_config: TEAM_STABLEFORD_CONFIG,
      },
    );

    const ada = recipients.find((r) => r.email === 'a@example.com');
    expect(ada?.mode).toMatchObject({
      kind: 'stableford',
      variant: 'team',
      teamPartnerName: null,
    });
  });
});
