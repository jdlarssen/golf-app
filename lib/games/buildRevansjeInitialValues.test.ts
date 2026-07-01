import { describe, it, expect } from 'vitest';
import {
  buildRevansjeInitialValues,
  type RevansjeGameRow,
  type RevansjePlayerRow,
} from './buildRevansjeInitialValues';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

// #1007 — prefill for revansje-flyten. Gjenbruker buildEditInitialValues
// under panseret, så disse testene dekker AVVIKENE fra en vanlig edit-prefill
// (kontrakt §Fase 1) i stedet for å duplisere hele mode_config-matrisen som
// allerede er dekket av setupStepInitialValues.test.ts.

function baseGame(overrides: Partial<RevansjeGameRow> = {}): RevansjeGameRow {
  return {
    id: 'g1',
    name: 'Stiklestad GK 3. juli',
    courses: { name: 'Stiklestad GK' },
    status: 'finished',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    scheduled_tee_off_at: '2026-06-15T09:00:00+02:00',
    hcp_allowance_pct: 100,
    require_peer_approval: false,
    score_visibility: 'live',
    side_tournament_enabled: true,
    side_ld_count: 1,
    side_ctp_count: 2,
    side_disabled_categories: ['clean_front_9'],
    game_mode: 'best_ball',
    mode_config: {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
    } satisfies GameModeConfig,
    registration_mode: 'invite_only',
    registration_type: 'team',
    let_friends_skip_gate: false,
    ...overrides,
  };
}

function player(
  overrides: Partial<RevansjePlayerRow> = {},
): RevansjePlayerRow {
  return {
    user_id: 'u1',
    team_number: 1,
    flight_number: 1,
    tee_gender: 'mens',
    withdrawn_at: null,
    ...overrides,
  };
}

describe('buildRevansjeInitialValues', () => {
  it('utelater name og scheduled_tee_off_at', () => {
    const result = buildRevansjeInitialValues(baseGame(), [player()]);

    expect(result.name).toBeUndefined();
    expect(result.scheduled_tee_off_at).toBeUndefined();
  });

  it('tvinger lock_game_mode til false selv om kilden er finished', () => {
    const result = buildRevansjeInitialValues(baseGame({ status: 'finished' }), [
      player(),
    ]);

    expect(result.lock_game_mode).toBe(false);
  });

  it('filtrerer bort withdrawn spillere', () => {
    const active = player({ user_id: 'u1' });
    const withdrawn = player({ user_id: 'u2', withdrawn_at: '2026-06-15T08:00:00Z' });

    const result = buildRevansjeInitialValues(baseGame(), [active, withdrawn]);

    const ids = result.players?.map((p) => p.user_id);
    expect(ids).toEqual(['u1']);
  });

  it.each(['wolf', 'round_robin'] as const)(
    '%s: nuller team_number og flight_number for alle spillere (#969-slots re-trekkes)',
    (gameMode) => {
      const modeConfig: GameModeConfig =
        gameMode === 'wolf'
          ? {
              kind: 'wolf',
              team_size: 1,
              teams_count: 4,
              wolf_scoring: 'net',
            }
          : {
              kind: 'round_robin',
              team_size: 1,
              teams_count: 4,
              allowance_pct: 85,
            };

      const result = buildRevansjeInitialValues(
        baseGame({ game_mode: gameMode, mode_config: modeConfig }),
        [
          player({ user_id: 'u1', team_number: 1, flight_number: 1 }),
          player({ user_id: 'u2', team_number: 2, flight_number: 1 }),
        ],
      );

      expect(result.players).toEqual([
        { user_id: 'u1', team_number: null, flight_number: null },
        { user_id: 'u2', team_number: null, flight_number: null },
      ]);
    },
  );

  it('best_ball (ikke wolf/RR): beholder team_number og flight_number', () => {
    const result = buildRevansjeInitialValues(baseGame(), [
      player({ user_id: 'u1', team_number: 1, flight_number: 2 }),
    ]);

    expect(result.players).toEqual([
      { user_id: 'u1', team_number: 1, flight_number: 2 },
    ]);
  });

  it('beholder side_*-config uendret (passthrough fra buildEditInitialValues)', () => {
    const result = buildRevansjeInitialValues(baseGame(), [player()]);

    expect(result.side_tournament_enabled).toBe(true);
    expect(result.side_ld_count).toBe(1);
    expect(result.side_ctp_count).toBe(2);
    expect(result.side_disabled_categories).toEqual(['clean_front_9']);
  });

  it('beholder course_id, tee_box_id og game_mode', () => {
    const result = buildRevansjeInitialValues(baseGame(), [player()]);

    expect(result.course_id).toBe('course-1');
    expect(result.tee_box_id).toBe('tee-1');
    expect(result.game_mode).toBe('best_ball');
  });
});
