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

  // ────────────────────────────────────────────────────────────────
  // Singles matchplay (epic #45) — 1v1 hull-for-hull. Hver av de to
  // spillerne får per-spiller payload med motspillerens navn og
  // matchresultat sett FRA mottakeren ('won' / 'lost' / 'tied').
  // ────────────────────────────────────────────────────────────────

  const MATCHPLAY_CONFIG: GameModeConfig = {
    kind: 'singles_matchplay',
    team_size: 1,
    teams_count: 2,
  };

  it('matchplay: side 1 vinner — side 1 får won, side 2 får lost; begge ser motspillerens fornavn', async () => {
    // 1 hull par 4, CH=0:
    //   side 1 (u1) gross 3 → netto 3 → vinner hullet
    //   side 2 (u2) gross 4 → netto 4 → taper hullet
    // 17 hull igjen, men 1 hull foran > 0 hull igjen er ikke nok for mat-em.
    // Match-state: side1 1up, holesRemaining 17 → live. Vi trenger mat-em
    // for å få et resultat — bygger 16 par-spilte hull der side 1 vinner
    // alle for å treffe mat-em 16&2 (men i praksis 9&9 etter 9 hull). For
    // testen er det enklere å gi side 1 et knusende lead som forblir live
    // gjennom 17 par-hull, eller … kort vei: spille 18 hull der side 1
    // vinner f.eks. 2up.
    //
    // Vi gjør 18 hull der side 1 vinner 2up: side 1 birdier 2 hull og
    // pars resten; side 2 pars alle 18. Det gir side1Wins=2, side2Wins=0,
    // holesUp=2, holesPlayed=18 → 2up.
    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      stroke_index: i + 1,
    }));
    const scores: { user_id: string; hole_number: number; strokes: number }[] =
      [];
    for (let h = 1; h <= 18; h++) {
      // u1 (side 1) birdie på hull 1+2, par på resten
      scores.push({
        user_id: 'u1',
        hole_number: h,
        strokes: h <= 2 ? 3 : 4,
      });
      scores.push({ user_id: 'u2', hole_number: h, strokes: 4 });
    }

    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'alice@example.com', name: 'Alice Olsen' },
          },
          {
            user_id: 'u2',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'bjorn@example.com', name: 'Bjørn Hansen' },
          },
        ],
        error: null,
      },
      { data: scores, error: null },
      { data: holes, error: null },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-mp1',
      {
        course_id: 'c1',
        game_mode: 'singles_matchplay',
        mode_config: MATCHPLAY_CONFIG,
      },
    );

    expect(recipients).toHaveLength(2);
    const alice = recipients.find((r) => r.email === 'alice@example.com');
    const bjorn = recipients.find((r) => r.email === 'bjorn@example.com');

    expect(alice?.mode).toEqual({
      kind: 'singles_matchplay',
      matchResult: 'won',
      formattedResult: '2up',
      opponentName: 'Bjørn',
      selfSide: 1,
    });
    expect(bjorn?.mode).toEqual({
      kind: 'singles_matchplay',
      matchResult: 'lost',
      formattedResult: '2up',
      opponentName: 'Alice',
      selfSide: 2,
    });
  });

  it('matchplay: side 2 vinner mat-em (3&2) — side 2 får won, side 1 får lost', async () => {
    // Side 2 vinner 3 hull foran med 2 igjen (3&2 etter hull 16).
    // Scenario: side 2 birdier hull 1-3, side 1 pars alle. Resten av hullene
    // (4-16) blir par/par tied. På hull 16 er status: side2 leder 3up med
    // 2 hull igjen → mat-em 3&2.
    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      stroke_index: i + 1,
    }));
    const scores: { user_id: string; hole_number: number; strokes: number }[] =
      [];
    for (let h = 1; h <= 16; h++) {
      // u1 (side 1) par alle hull 1-16
      scores.push({ user_id: 'u1', hole_number: h, strokes: 4 });
      // u2 (side 2) birdie på hull 1-3, par resten
      scores.push({
        user_id: 'u2',
        hole_number: h,
        strokes: h <= 3 ? 3 : 4,
      });
    }
    // Hull 17-18: kun side 1 har spilt (uplayed for side 2) → uplayed totalt.
    // Scoring-laget skal allikevel se mat-em 3&2 etter hull 16.

    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Alice' },
          },
          {
            user_id: 'u2',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'b@example.com', name: 'Bjørn' },
          },
        ],
        error: null,
      },
      { data: scores, error: null },
      { data: holes, error: null },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-mp2',
      {
        course_id: 'c1',
        game_mode: 'singles_matchplay',
        mode_config: MATCHPLAY_CONFIG,
      },
    );

    const alice = recipients.find((r) => r.email === 'a@example.com');
    const bjorn = recipients.find((r) => r.email === 'b@example.com');

    expect(alice?.mode).toMatchObject({
      kind: 'singles_matchplay',
      matchResult: 'lost',
      formattedResult: '3&2',
      opponentName: 'Bjørn',
      selfSide: 1,
    });
    expect(bjorn?.mode).toMatchObject({
      kind: 'singles_matchplay',
      matchResult: 'won',
      formattedResult: '3&2',
      opponentName: 'Alice',
      selfSide: 2,
    });
  });

  it('matchplay: tied etter 18 hull (AS) — begge får tied', async () => {
    // Alle 18 hull spilles par/par → side1Wins=0, side2Wins=0, holesUp=0,
    // holesPlayed=18 → AS.
    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      stroke_index: i + 1,
    }));
    const scores: { user_id: string; hole_number: number; strokes: number }[] =
      [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ user_id: 'u1', hole_number: h, strokes: 4 });
      scores.push({ user_id: 'u2', hole_number: h, strokes: 4 });
    }

    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Alice' },
          },
          {
            user_id: 'u2',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'b@example.com', name: 'Bjørn' },
          },
        ],
        error: null,
      },
      { data: scores, error: null },
      { data: holes, error: null },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-mp3',
      {
        course_id: 'c1',
        game_mode: 'singles_matchplay',
        mode_config: MATCHPLAY_CONFIG,
      },
    );

    const alice = recipients.find((r) => r.email === 'a@example.com');
    const bjorn = recipients.find((r) => r.email === 'b@example.com');

    expect(alice?.mode).toEqual({
      kind: 'singles_matchplay',
      matchResult: 'tied',
      formattedResult: 'AS',
      opponentName: 'Bjørn',
      selfSide: 1,
    });
    expect(bjorn?.mode).toEqual({
      kind: 'singles_matchplay',
      matchResult: 'tied',
      formattedResult: 'AS',
      opponentName: 'Alice',
      selfSide: 2,
    });
  });

  it('matchplay: dropper spiller uten email — den andre beholder mode-payload', async () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      stroke_index: i + 1,
    }));
    const scores: { user_id: string; hole_number: number; strokes: number }[] =
      [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ user_id: 'u1', hole_number: h, strokes: 4 });
      scores.push({ user_id: 'u2', hole_number: h, strokes: 4 });
    }

    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Alice' },
          },
          {
            user_id: 'u2',
            team_number: 2,
            course_handicap: 0,
            users: { email: null, name: 'Bjørn' }, // dropp
          },
        ],
        error: null,
      },
      { data: scores, error: null },
      { data: holes, error: null },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-mp4',
      {
        course_id: 'c1',
        game_mode: 'singles_matchplay',
        mode_config: MATCHPLAY_CONFIG,
      },
    );

    expect(recipients).toHaveLength(1);
    expect(recipients[0]!.email).toBe('a@example.com');
    // Alice ser fortsatt motspillerens navn selv om Bjørn ikke får mail.
    expect(recipients[0]!.mode).toMatchObject({
      kind: 'singles_matchplay',
      matchResult: 'tied',
      opponentName: 'Bjørn',
      selfSide: 1,
    });
  });

  it('matchplay: motspiller uten navn → opponentName: null', async () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      stroke_index: i + 1,
    }));
    const scores: { user_id: string; hole_number: number; strokes: number }[] =
      [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ user_id: 'u1', hole_number: h, strokes: 4 });
      scores.push({ user_id: 'u2', hole_number: h, strokes: 4 });
    }

    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Alice' },
          },
          {
            user_id: 'u2',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'b@example.com', name: null }, // ingen navn
          },
        ],
        error: null,
      },
      { data: scores, error: null },
      { data: holes, error: null },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-mp5',
      {
        course_id: 'c1',
        game_mode: 'singles_matchplay',
        mode_config: MATCHPLAY_CONFIG,
      },
    );

    const alice = recipients.find((r) => r.email === 'a@example.com');
    expect(alice?.mode).toMatchObject({
      kind: 'singles_matchplay',
      opponentName: null,
    });
  });

  it('matchplay: match ikke avgjort (live midt i runden) — faller tilbake til nøytral copy uten mode', async () => {
    // Kun 5 hull spilte par/par → holesPlayed=5, holesRemaining=13, holesUp=0.
    // Ingen mat-em (|0| > 13 er falsk), ikke spilt 18 hull. result === null.
    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      stroke_index: i + 1,
    }));
    const scores: { user_id: string; hole_number: number; strokes: number }[] =
      [];
    for (let h = 1; h <= 5; h++) {
      scores.push({ user_id: 'u1', hole_number: h, strokes: 4 });
      scores.push({ user_id: 'u2', hole_number: h, strokes: 4 });
    }

    const supabase = buildSupabaseMock([
      {
        data: [
          {
            user_id: 'u1',
            team_number: 1,
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Alice' },
          },
          {
            user_id: 'u2',
            team_number: 2,
            course_handicap: 0,
            users: { email: 'b@example.com', name: 'Bjørn' },
          },
        ],
        error: null,
      },
      { data: scores, error: null },
      { data: holes, error: null },
    ]);

    const recipients = await buildGameFinishedRecipients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      'game-mp6',
      {
        course_id: 'c1',
        game_mode: 'singles_matchplay',
        mode_config: MATCHPLAY_CONFIG,
      },
    );

    expect(recipients).toHaveLength(2);
    for (const r of recipients) {
      // Fallback til nøytral copy — ingen mode-payload satt.
      expect(r.mode).toBeUndefined();
    }
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
