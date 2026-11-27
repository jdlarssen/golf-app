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

  it('#2460: utelater «Gjenta hver uke» (en revansje er en enkeltrunde)', () => {
    const result = buildRevansjeInitialValues(baseGame({ repeat_weekly: true }), [player()]);

    expect(result.repeat_weekly).toBeUndefined();
    expect(result.repeat_weekly_linked).toBeUndefined();
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

  it('hullene til sideturneringen følger med revansjen (#2283)', () => {
    const result = buildRevansjeInitialValues(
      baseGame({ side_ld_holes: [9], side_ctp_holes: [null, 7] }),
      [player()],
    );

    expect(result.side_ld_holes).toEqual([9]);
    expect(result.side_ctp_holes).toEqual([null, 7]);
  });

  it('uten hull på kilden gir revansjen ingen hull (#2283)', () => {
    const result = buildRevansjeInitialValues(
      baseGame({ side_ld_holes: null, side_ctp_holes: null }),
      [player()],
    );

    expect(result.side_ld_holes).toBeNull();
    expect(result.side_ctp_holes).toBeNull();
  });

  it('beholder course_id, tee_box_id og game_mode', () => {
    const result = buildRevansjeInitialValues(baseGame(), [player()]);

    expect(result.course_id).toBe('course-1');
    expect(result.tee_box_id).toBe('tee-1');
    expect(result.game_mode).toBe('best_ball');
  });
});

// #3002: a rematch is a NEW game, so it starts on the new rules. A source
// game from before #3002 has no `team_handicap_rule` / `fourball_allowance_pct`;
// the edit prefill reads that as null («keep the old rule»), which a rematch
// must not carry over. An organiser's own choice (gross or another share) is
// kept as «Egen prosent»; the old start value gives way to the new start.
describe('buildRevansjeInitialValues — regelbok F23 og F24 (#3002)', () => {
  const texas = (extra: Record<string, unknown> = {}) =>
    baseGame({
      game_mode: 'texas_scramble',
      mode_config: { kind: 'texas_scramble', team_size: 4, teams_count: 2, team_handicap_pct: 10, ...extra } as GameModeConfig,
    });

  it('eldre Texas på den gamle startverdien starter på formatets nye regel', () => {
    const result = buildRevansjeInitialValues(texas(), [player()]);
    expect(result.team_handicap_rule).toBeUndefined();
    expect('team_handicap_rule' in result).toBe(false);
  });

  it('eldre Texas i brutto beholder brutto som «Egen prosent» 0', () => {
    const result = buildRevansjeInitialValues(texas({ team_handicap_pct: 0 }), [player()]);
    expect(result.team_handicap_rule).toBe('pct');
    expect(result.texas_team_handicap_pct).toBe('0');
  });

  it('eldre Texas med arrangørens egen prosent beholder den', () => {
    const result = buildRevansjeInitialValues(texas({ team_handicap_pct: 20 }), [player()]);
    expect(result.team_handicap_rule).toBe('pct');
    expect(result.texas_team_handicap_pct).toBe('20');
  });

  it('eldre Ambrose på formelen starter på formatets regel', () => {
    const result = buildRevansjeInitialValues(
      baseGame({
        game_mode: 'ambrose',
        mode_config: { kind: 'ambrose', team_size: 3, teams_count: 2, team_handicap_pct: 16.67 } as GameModeConfig,
      }),
      [player()],
    );
    expect('team_handicap_rule' in result).toBe(false);
  });

  it('et spill med regelen tar den med', () => {
    const result = buildRevansjeInitialValues(texas({ team_handicap_rule: 'ngf_weighted' }), [player()]);
    expect(result.team_handicap_rule).toBe('ngf');
  });

  it('eldre patsome starter på 85; et spill med andelen tar den med', () => {
    const patsome = (extra: Record<string, unknown> = {}) =>
      baseGame({
        game_mode: 'patsome',
        mode_config: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net', ...extra } as GameModeConfig,
      });
    const old = buildRevansjeInitialValues(patsome(), [player()]);
    expect('patsome_fourball_allowance_pct' in old).toBe(false);
    expect(buildRevansjeInitialValues(patsome({ fourball_allowance_pct: 90 }), [player()]).patsome_fourball_allowance_pct).toBe(90);
  });
});
