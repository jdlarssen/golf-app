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
            course_handicap: 18,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            user_id: 'u2',
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
            course_handicap: 18,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            user_id: 'u2',
            course_handicap: 14,
            users: { email: null, name: 'Bjørn uten email' }, // dropp
          },
          {
            user_id: 'u3',
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
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            user_id: 'u2',
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
      rank: 1,
      totalPoints: 5,
      totalPlayers: 2,
    });
    expect(u2?.mode).toEqual({
      kind: 'stableford',
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
            course_handicap: 0,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            user_id: 'u2',
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
      totalPlayers: 2,
    });
  });
});
