import { describe, it, expect } from 'vitest';
import { buildGameInsertPayload, parseOsloDateTimeLocal } from './gamePayload';

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe('parseOsloDateTimeLocal', () => {
  it('parses summer (CEST/+02:00) wall-clock to UTC', () => {
    // 2026-06-15 09:00 Oslo = 07:00 UTC
    expect(parseOsloDateTimeLocal('2026-06-15T09:00')).toBe(
      '2026-06-15T07:00:00.000Z',
    );
  });

  it('parses winter (CET/+01:00) wall-clock to UTC', () => {
    // 2026-12-15 09:00 Oslo = 08:00 UTC
    expect(parseOsloDateTimeLocal('2026-12-15T09:00')).toBe(
      '2026-12-15T08:00:00.000Z',
    );
  });

  it('throws on a malformed string', () => {
    expect(() => parseOsloDateTimeLocal('not a date')).toThrow();
  });

  it('resolves the ambiguous fall-back hour to post-transition CET (+01:00)', () => {
    // 2026-10-25 02:30 Europe/Oslo is ambiguous (DST ended at 03:00→02:00).
    // Implementation deliberately falls back to post-transition offset (+01:00):
    // 02:30 CET = 01:30 UTC.
    expect(parseOsloDateTimeLocal('2026-10-25T02:30')).toBe(
      '2026-10-25T01:30:00.000Z',
    );
  });
});

describe('buildGameInsertPayload (draft mode)', () => {
  it('requires only name', () => {
    const result = buildGameInsertPayload(fd({ name: 'Vinter-cup' }), 'draft');
    expect(result.errorCode).toBeUndefined();
    expect(result.name).toBe('Vinter-cup');
    expect(result.course_id).toBeNull();
    expect(result.tee_box_id).toBeNull();
    expect(result.players).toEqual([]);
  });

  it('rejects empty name', () => {
    const result = buildGameInsertPayload(fd({ name: '   ' }), 'draft');
    expect(result.errorCode).toBe('name_required');
  });

  it('accepts a partial player list without team-balance check', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test',
        player_0_id: 'u1', player_0_team: '1', player_0_flight: '1',
        player_1_id: 'u2', player_1_team: '1', player_1_flight: '1',
        player_2_id: 'u3', player_2_team: '2', player_2_flight: '1',
      }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(3);
  });

  it('still rejects duplicate players in draft mode', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test',
        player_0_id: 'u1', player_0_team: '1', player_0_flight: '1',
        player_1_id: 'u1', player_1_team: '2', player_1_flight: '1',
      }),
      'draft',
    );
    expect(result.errorCode).toBe('duplicate_player');
  });

  it('coerces empty course/tee-box to null without error', () => {
    const result = buildGameInsertPayload(
      fd({ name: 'Test', course_id: '', tee_box_id: '' }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.course_id).toBeNull();
    expect(result.tee_box_id).toBeNull();
  });
});

describe('buildGameInsertPayload (publish mode)', () => {
  it('requires course', () => {
    const result = buildGameInsertPayload(fd({ name: 'Test' }), 'publish');
    expect(result.errorCode).toBe('course_required');
  });

  it('requires 8 balanced players', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test', course_id: 'c1', tee_box_id: 't1',
        player_0_id: 'u1', player_0_team: '1', player_0_flight: '1',
      }),
      'publish',
    );
    expect(result.errorCode).toBe('players_required');
  });

  it('accepts a full balanced lineup', () => {
    const entries: Record<string, string> = {
      name: 'Test', course_id: 'c1', tee_box_id: 't1',
    };
    for (let i = 0; i < 8; i++) {
      entries[`player_${i}_id`] = `u${i}`;
      entries[`player_${i}_team`] = String(Math.floor(i / 2) + 1);
      entries[`player_${i}_flight`] = String(Math.floor(i / 2) < 2 ? 1 : 2);
    }
    const result = buildGameInsertPayload(fd(entries), 'publish');
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(8);
  });
});

describe('buildGameInsertPayload — mode discriminator (epic #41)', () => {
  it('defaults to best_ball_netto when game_mode is missing (back-compat)', () => {
    // Form-feltet game_mode innføres først i fase 4 (GameForm UI). Inntil
    // velgeren er ute må payload-builderen falle tilbake til best-ball så
    // dagens admin-flyt ikke brekker.
    const entries: Record<string, string> = {
      name: 'Test', course_id: 'c1', tee_box_id: 't1',
    };
    for (let i = 0; i < 8; i++) {
      entries[`player_${i}_id`] = `u${i}`;
      entries[`player_${i}_team`] = String(Math.floor(i / 2) + 1);
      entries[`player_${i}_flight`] = String(Math.floor(i / 2) < 2 ? 1 : 2);
    }
    const result = buildGameInsertPayload(fd(entries), 'publish');
    expect(result.errorCode).toBeUndefined();
    expect(result.game_mode).toBe('best_ball_netto');
    expect(result.mode_config).toEqual({
      kind: 'best_ball_netto',
      team_size: 2,
      teams_count: 4,
    });
  });

  it('rejects unknown game_mode with mode_required', () => {
    const result = buildGameInsertPayload(
      fd({ name: 'Test', game_mode: 'matchplay' }),
      'draft',
    );
    expect(result.errorCode).toBe('mode_required');
  });
});

describe('buildGameInsertPayload — stableford solo', () => {
  function stablefordFd(
    extras: Record<string, string> = {},
    playerIds: string[] = ['u1', 'u2'],
  ): FormData {
    const base: Record<string, string> = {
      name: 'Solo Cup',
      course_id: 'c1',
      tee_box_id: 't1',
      game_mode: 'stableford',
    };
    playerIds.forEach((id, i) => {
      base[`player_${i}_id`] = id;
    });
    return fd({ ...base, ...extras });
  }

  it('publishes stableford with 2 players, all team/flight null, mode_config solo', () => {
    const result = buildGameInsertPayload(stablefordFd(), 'publish');
    expect(result.errorCode).toBeUndefined();
    expect(result.game_mode).toBe('stableford');
    expect(result.mode_config).toEqual({
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    });
    expect(result.players).toEqual([
      { user_id: 'u1', team_number: null, flight_number: null },
      { user_id: 'u2', team_number: null, flight_number: null },
    ]);
  });

  it('publishes stableford with a single solo player (min 1)', () => {
    // Stableford-modusen er solo — én spiller er nok så lenge admin har
    // valgt modusen eksplisitt. Best-ball-regelen om eksakt 8 gjelder ikke.
    const result = buildGameInsertPayload(
      stablefordFd({}, ['u1']),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(1);
  });

  it('rejects stableford publish with 0 players (min_players_for_mode)', () => {
    // Tomt array er kun OK i draft-modus; publish trenger minst én spiller.
    const result = buildGameInsertPayload(
      stablefordFd({}, []),
      'publish',
    );
    expect(result.errorCode).toBe('min_players_for_mode');
  });

  it('ignores stale team/flight inputs for stableford players', () => {
    // Hvis admin har byttet modus i UI-en uten å nullstille de tidligere
    // lag-tildelingene, skal builderen normalisere bort verdiene istedenfor
    // å feile — DB-CHECK krever team og flight null sammen for solo.
    const result = buildGameInsertPayload(
      stablefordFd({
        player_0_team: '1',
        player_0_flight: '1',
        player_1_team: '2',
        player_1_flight: '1',
      }),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players.every((p) => p.team_number === null)).toBe(true);
    expect(result.players.every((p) => p.flight_number === null)).toBe(true);
  });

  it('still rejects duplicate players in stableford publish', () => {
    const result = buildGameInsertPayload(
      stablefordFd({}, ['u1', 'u1']),
      'publish',
    );
    expect(result.errorCode).toBe('duplicate_player');
  });

  it('draft-mode stableford tolerates 0 players', () => {
    const result = buildGameInsertPayload(
      stablefordFd({}, []),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toEqual([]);
  });
});

describe('buildGameInsertPayload — par-stableford (team_size=2 / 4BBB)', () => {
  /**
   * Helper for par-stableford-payloads. Tar et antall lag og fyller hver
   * lag-rad med to spillere (par-stableford krever EKSAKT 2 per lag).
   * Flight-nummer = team-nummer (samme rad) — par-stableford bruker ikke
   * flights uavhengig av lag, men DB-CHECK krever begge satt eller null
   * sammen, så vi mapper dem 1:1.
   */
  function teamStablefordFd(opts: {
    teams: number;
    extras?: Record<string, string>;
    /** Antall spillere per lag — default 2. Sett mindre for å teste team_balance. */
    playersPerTeam?: number;
  }): FormData {
    const { teams, extras = {}, playersPerTeam = 2 } = opts;
    const base: Record<string, string> = {
      name: 'Par Cup',
      course_id: 'c1',
      tee_box_id: 't1',
      game_mode: 'stableford',
      stableford_team_size: '2',
    };
    let slot = 0;
    for (let t = 1; t <= teams; t++) {
      for (let m = 0; m < playersPerTeam; m++) {
        const id = `u${t}_${m + 1}`;
        base[`player_${slot}_id`] = id;
        base[`player_${slot}_team`] = String(t);
        base[`player_${slot}_flight`] = String(t);
        slot += 1;
      }
    }
    return fd({ ...base, ...extras });
  }

  it('publishes par-stableford med 1 lag à 2 spillere → ok, mode_config team', () => {
    const result = buildGameInsertPayload(
      teamStablefordFd({ teams: 1 }),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.game_mode).toBe('stableford');
    expect(result.mode_config).toEqual({
      kind: 'stableford',
      team_size: 2,
      points_table: 'standard',
    });
    expect(result.players).toEqual([
      { user_id: 'u1_1', team_number: 1, flight_number: 1 },
      { user_id: 'u1_2', team_number: 1, flight_number: 1 },
    ]);
  });

  it('publishes par-stableford med 4 lag à 2 spillere → ok', () => {
    const result = buildGameInsertPayload(
      teamStablefordFd({ teams: 4 }),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(8);
    // Sjekk at hver spiller har team og flight satt.
    expect(result.players.every((p) => p.team_number !== null)).toBe(true);
    expect(result.players.every((p) => p.flight_number !== null)).toBe(true);
  });

  it('rejecter par-stableford publish med 1 spiller på et lag (team_balance)', () => {
    const result = buildGameInsertPayload(
      teamStablefordFd({ teams: 1, playersPerTeam: 1 }),
      'publish',
    );
    expect(result.errorCode).toBe('team_balance');
  });

  it('rejecter par-stableford publish med 0 lag (min_players_for_mode)', () => {
    const result = buildGameInsertPayload(
      teamStablefordFd({ teams: 0 }),
      'publish',
    );
    expect(result.errorCode).toBe('min_players_for_mode');
  });

  it('rejecter par-stableford med duplikat spiller', () => {
    const result = buildGameInsertPayload(
      teamStablefordFd({
        teams: 1,
        extras: {
          player_0_id: 'dup',
          player_1_id: 'dup',
        },
      }),
      'publish',
    );
    expect(result.errorCode).toBe('duplicate_player');
  });

  it('draft-mode par-stableford tolerer ufullstendige lag', () => {
    // Draft tillater partial state — 1 spiller på et lag skal IKKE feile.
    const result = buildGameInsertPayload(
      teamStablefordFd({ teams: 1, playersPerTeam: 1 }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(1);
    expect(result.mode_config).toEqual({
      kind: 'stableford',
      team_size: 2,
      points_table: 'standard',
    });
  });

  it('draft-mode par-stableford tolerer 0 spillere', () => {
    const result = buildGameInsertPayload(
      teamStablefordFd({ teams: 0 }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toEqual([]);
  });

  it('par-stableford uten team-nummer på en spiller → bad_team', () => {
    const result = buildGameInsertPayload(
      teamStablefordFd({
        teams: 1,
        extras: {
          player_0_team: '', // tom team-verdi
        },
      }),
      'publish',
    );
    expect(result.errorCode).toBe('bad_team');
  });

  it('par-stableford defaulter til solo (team_size=1) hvis feltet mangler', () => {
    // Bakoverkompatibilitet: hvis form-en ikke sender stableford_team_size,
    // antar vi solo (eksisterende oppførsel). Test setter alle andre felter
    // som om det var solo og forventer solo mode_config.
    const result = buildGameInsertPayload(
      fd({
        name: 'Solo Cup',
        course_id: 'c1',
        tee_box_id: 't1',
        game_mode: 'stableford',
        player_0_id: 'u1',
      }),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.mode_config).toEqual({
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    });
  });

  it('par-stableford ignorerer ugyldig stableford_team_size og defaulter til solo', () => {
    // Defensivt: ukjent verdi (f.eks. fra DevTools-tampering) defaulter til
    // solo, ikke en exception. Solo-validatoren skal akseptere payloaden.
    const result = buildGameInsertPayload(
      fd({
        name: 'Solo Cup',
        course_id: 'c1',
        tee_box_id: 't1',
        game_mode: 'stableford',
        stableford_team_size: '7',
        player_0_id: 'u1',
      }),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.mode_config).toEqual({
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    });
  });
});

describe('buildGameInsertPayload — singles_matchplay (epic #45)', () => {
  /**
   * Helper for matchplay-payloads. Bygger en form med game_mode=singles_matchplay
   * og spillere fordelt på sider — én entry per spiller med team_number=side.
   */
  function matchplayFd(opts: {
    sides?: Array<{ userId: string; side: number }>;
    extras?: Record<string, string>;
  }): FormData {
    const { sides = [], extras = {} } = opts;
    const base: Record<string, string> = {
      name: 'Match Cup',
      course_id: 'c1',
      tee_box_id: 't1',
      game_mode: 'singles_matchplay',
    };
    sides.forEach((p, i) => {
      base[`player_${i}_id`] = p.userId;
      base[`player_${i}_team`] = String(p.side);
      base[`player_${i}_flight`] = String(p.side);
    });
    return fd({ ...base, ...extras });
  }

  it('publish med 2 spillere på side 1 og 2 → ok, mode_config matchplay', () => {
    const result = buildGameInsertPayload(
      matchplayFd({
        sides: [
          { userId: 'a', side: 1 },
          { userId: 'b', side: 2 },
        ],
      }),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.game_mode).toBe('singles_matchplay');
    expect(result.mode_config).toEqual({
      kind: 'singles_matchplay',
      team_size: 1,
      teams_count: 2,
    });
    expect(result.players).toEqual([
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 2, flight_number: 2 },
    ]);
  });

  it('publish med begge spillere på side 1 → team_balance', () => {
    const result = buildGameInsertPayload(
      matchplayFd({
        sides: [
          { userId: 'a', side: 1 },
          { userId: 'b', side: 1 },
        ],
      }),
      'publish',
    );
    expect(result.errorCode).toBe('team_balance');
  });

  it('publish med 1 spiller → min_players_for_mode', () => {
    const result = buildGameInsertPayload(
      matchplayFd({ sides: [{ userId: 'a', side: 1 }] }),
      'publish',
    );
    expect(result.errorCode).toBe('min_players_for_mode');
  });

  it('publish med 0 spillere → min_players_for_mode', () => {
    const result = buildGameInsertPayload(
      matchplayFd({ sides: [] }),
      'publish',
    );
    expect(result.errorCode).toBe('min_players_for_mode');
  });

  it('publish med 3 spillere → too_many_players_for_mode', () => {
    const result = buildGameInsertPayload(
      matchplayFd({
        sides: [
          { userId: 'a', side: 1 },
          { userId: 'b', side: 2 },
          { userId: 'c', side: 1 },
        ],
      }),
      'publish',
    );
    expect(result.errorCode).toBe('too_many_players_for_mode');
  });

  it('publish med duplikat spiller → duplicate_player', () => {
    const result = buildGameInsertPayload(
      matchplayFd({
        sides: [
          { userId: 'dup', side: 1 },
          { userId: 'dup', side: 2 },
        ],
      }),
      'publish',
    );
    expect(result.errorCode).toBe('duplicate_player');
  });

  it('publish med ugyldig side (3) → bad_team', () => {
    const result = buildGameInsertPayload(
      matchplayFd({
        sides: [
          { userId: 'a', side: 1 },
          { userId: 'b', side: 3 },
        ],
      }),
      'publish',
    );
    expect(result.errorCode).toBe('bad_team');
  });

  it('publish med tom team-verdi → bad_team', () => {
    const result = buildGameInsertPayload(
      matchplayFd({
        sides: [
          { userId: 'a', side: 1 },
          { userId: 'b', side: 2 },
        ],
        extras: { player_1_team: '' },
      }),
      'publish',
    );
    expect(result.errorCode).toBe('bad_team');
  });

  it('draft tolererer 1 spiller (ufullstendig matchplay-oppsett)', () => {
    const result = buildGameInsertPayload(
      matchplayFd({ sides: [{ userId: 'a', side: 1 }] }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(1);
    expect(result.mode_config).toEqual({
      kind: 'singles_matchplay',
      team_size: 1,
      teams_count: 2,
    });
  });

  it('draft tolererer 0 spillere', () => {
    const result = buildGameInsertPayload(
      matchplayFd({ sides: [] }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toEqual([]);
  });

  it('draft tolererer begge spillere på samme side (publish ville feilet)', () => {
    // Draft skal IKKE feile på side-balansen — admin kan være halvveis i
    // å sette opp matchen. Publish vil fortsatt blokkere.
    const result = buildGameInsertPayload(
      matchplayFd({
        sides: [
          { userId: 'a', side: 1 },
          { userId: 'b', side: 1 },
        ],
      }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(2);
  });

  it('flight_number = team_number for matchplay-spillere (DB-CHECK)', () => {
    // game_players_team_flight_consistency krever begge satt eller null
    // sammen. Matchplay-validatoren speiler par-stableford-mønsteret og
    // setter flight = team.
    const result = buildGameInsertPayload(
      matchplayFd({
        sides: [
          { userId: 'a', side: 1 },
          { userId: 'b', side: 2 },
        ],
      }),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players[0].flight_number).toBe(1);
    expect(result.players[1].flight_number).toBe(2);
  });
});

describe('buildGameInsertPayload — solo_strokeplay_netto (epic #46)', () => {
  /**
   * Helper for solo strokeplay netto-payloads. Speiler stablefordFd-mønsteret:
   * solo-modus, ingen lag/flight-tilordning, kun spillere som flate slots.
   */
  function strokeplayFd(
    extras: Record<string, string> = {},
    playerIds: string[] = ['u1', 'u2'],
  ): FormData {
    const base: Record<string, string> = {
      name: 'Slagspill Cup',
      course_id: 'c1',
      tee_box_id: 't1',
      game_mode: 'solo_strokeplay_netto',
    };
    playerIds.forEach((id, i) => {
      base[`player_${i}_id`] = id;
    });
    return fd({ ...base, ...extras });
  }

  it('publish med 2 spillere → ok, mode_config korrekt, alle team/flight null', () => {
    const result = buildGameInsertPayload(strokeplayFd(), 'publish');
    expect(result.errorCode).toBeUndefined();
    expect(result.game_mode).toBe('solo_strokeplay_netto');
    expect(result.mode_config).toEqual({
      kind: 'solo_strokeplay_netto',
      team_size: 1,
    });
    expect(result.players).toEqual([
      { user_id: 'u1', team_number: null, flight_number: null },
      { user_id: 'u2', team_number: null, flight_number: null },
    ]);
  });

  it('publish med 1 spiller → ok (én spiller er nok så lenge admin valgte modusen)', () => {
    const result = buildGameInsertPayload(strokeplayFd({}, ['u1']), 'publish');
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(1);
  });

  it('publish med 0 spillere → min_players_for_mode', () => {
    const result = buildGameInsertPayload(strokeplayFd({}, []), 'publish');
    expect(result.errorCode).toBe('min_players_for_mode');
  });

  it('draft tolererer 0 spillere', () => {
    const result = buildGameInsertPayload(strokeplayFd({}, []), 'draft');
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toEqual([]);
  });

  it('rejecter duplikat spiller', () => {
    const result = buildGameInsertPayload(
      strokeplayFd({}, ['u1', 'u1']),
      'publish',
    );
    expect(result.errorCode).toBe('duplicate_player');
  });

  it('ignorerer stale team/flight inputs (normaliserer til null)', () => {
    // Hvis admin har byttet modus i UI-en uten å nullstille tidligere
    // lag-tildelinger, skal builderen normalisere bort verdiene — DB-CHECK
    // krever team og flight null sammen for solo.
    const result = buildGameInsertPayload(
      strokeplayFd({
        player_0_team: '1',
        player_0_flight: '1',
        player_1_team: '2',
        player_1_flight: '1',
      }),
      'publish',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players.every((p) => p.team_number === null)).toBe(true);
    expect(result.players.every((p) => p.flight_number === null)).toBe(true);
  });
});
