import { describe, it, expect } from 'vitest';
import {
  planGreensomeStartOverride,
  readStoredTeamStrokesOverride,
  type GreensomeStartPlayer,
} from './greensomeOverridePlan';

/**
 * Type A-tester for #1628: greensomens lagrede lag-slag-forslag skal følge et
 * handicap som ble rettet ETTER at cupen ble generert, men FØR runden startet.
 *
 * Fiksturen gjenbruker #1537-tallene:
 *   greensomeTeamHandicap(50, 3)  = round(0.6*3  + 0.4*50) = 22   (lagret)
 *   greensomeTeamHandicap(50, -2) = round(0.6*-2 + 0.4*50) = 19   (etter retting)
 */

const STORED = 22;
const RECOMPUTED = 19;

function player(
  teamNumber: number | null,
  rawCourseHandicap: number,
  withdrawnAt: string | null = null,
): GreensomeStartPlayer {
  return { teamNumber, withdrawnAt, rawCourseHandicap };
}

/** Begge sider urørt: lagret override == lagret auto-forslag. */
function untouchedConfig(team1 = STORED, team2 = 10) {
  return {
    kind: 'greensome_matchplay',
    team_size: 2,
    teams_count: 2,
    allowance_pct: 100,
    team_strokes_override: { team1, team2 },
    team_strokes_override_auto: { team1, team2 },
  };
}

/** Side 1 = 50/3 (gir 22), side 2 = 12/9 (gir 10). */
function roster(side1Raw: [number, number] = [50, 3]): GreensomeStartPlayer[] {
  return [
    player(1, side1Raw[0]),
    player(1, side1Raw[1]),
    player(2, 12),
    player(2, 9),
  ];
}

describe('planGreensomeStartOverride (#1628)', () => {
  it('urørt forslag + endret handicap → begge felt re-deriveres for den siden', () => {
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: untouchedConfig(),
        players: roster([50, -2]),
      }),
    ).toEqual({
      teamStrokesOverride: { team1: RECOMPUTED, team2: 10 },
      teamStrokesOverrideAuto: { team1: RECOMPUTED, team2: 10 },
    });
  });

  it('urørt forslag, ingenting endret → ingen skriving', () => {
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: untouchedConfig(),
        players: roster(),
      }),
    ).toBeNull();
  });

  it('hånd-redigert side (override ≠ auto) → aldri rørt', () => {
    const config = {
      ...untouchedConfig(),
      // Arrangøren tastet 7 over forslaget på side 1.
      team_strokes_override: { team1: 7, team2: 10 },
      team_strokes_override_auto: { team1: STORED, team2: 10 },
    };
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: config,
        players: roster([50, -2]),
      }),
    ).toBeNull();
  });

  it('kun ett lag urørt → kun det laget re-deriveres', () => {
    const config = {
      ...untouchedConfig(),
      team_strokes_override: { team1: STORED, team2: 3 },
      team_strokes_override_auto: { team1: STORED, team2: 10 },
    };
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: config,
        // Side 2 endret seg også, men er hånd-redigert og skal stå.
        players: [player(1, 50), player(1, -2), player(2, 30), player(2, 30)],
      }),
    ).toEqual({
      teamStrokesOverride: { team1: RECOMPUTED, team2: 3 },
      teamStrokesOverrideAuto: { team1: RECOMPUTED, team2: 10 },
    });
  });

  it('`_auto` mangler (kamp generert før #1628) → aldri rørt', () => {
    const config = {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100,
      team_strokes_override: { team1: STORED, team2: 10 },
    };
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: config,
        players: roster([50, -2]),
      }),
    ).toBeNull();
  });

  it('override mangler helt → aldri rørt', () => {
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2 },
        players: roster([50, -2]),
      }),
    ).toBeNull();
  });

  it('ikke-greensome modus → aldri rørt, selv med feltene satt', () => {
    expect(
      planGreensomeStartOverride({
        gameMode: 'foursomes_matchplay',
        modeConfig: untouchedConfig(),
        players: roster([50, -2]),
      }),
    ).toBeNull();
  });

  it('trukket spiller + erstatter på samme side → partner er den aktive raden', () => {
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: untouchedConfig(),
        players: [
          player(1, 50),
          player(1, 40, '2026-08-01T10:00:00Z'), // trukket — teller ikke
          player(1, -2),
          player(2, 12),
          player(2, 9),
        ],
      }),
    ).toEqual({
      teamStrokesOverride: { team1: RECOMPUTED, team2: 10 },
      teamStrokesOverrideAuto: { team1: RECOMPUTED, team2: 10 },
    });
  });

  it('tre aktive spillere på samme side → konservativt hopp over den siden', () => {
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: untouchedConfig(),
        players: [
          player(1, 50),
          player(1, 40),
          player(1, -2),
          player(2, 12),
          player(2, 9),
        ],
      }),
    ).toBeNull();
  });

  it('spiller uten team_number teller ikke som partner', () => {
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: untouchedConfig(),
        players: [player(1, 50), player(null, -2), player(2, 12), player(2, 9)],
      }),
    ).toBeNull();
  });

  it('ikke-endelige rå banehandicap på en side → den siden hoppes over', () => {
    expect(
      planGreensomeStartOverride({
        gameMode: 'greensome_matchplay',
        modeConfig: untouchedConfig(),
        players: [player(1, 50), player(1, Number.NaN), player(2, 12), player(2, 9)],
      }),
    ).toBeNull();
  });
});

describe('readStoredTeamStrokesOverride', () => {
  it.each([
    ['null', null],
    ['ikke-objekt', 'nope'],
    ['felt mangler', { kind: 'greensome_matchplay' }],
    ['felt ikke objekt', { team_strokes_override: 5 }],
    ['team1 ikke tall', { team_strokes_override: { team1: '5', team2: 0 } }],
    ['team2 mangler', { team_strokes_override: { team1: 5 } }],
    ['NaN', { team_strokes_override: { team1: Number.NaN, team2: 0 } }],
  ])('%s → null', (_label, input) => {
    expect(readStoredTeamStrokesOverride(input)).toBeNull();
  });

  it('gyldig par → {team1, team2}', () => {
    expect(
      readStoredTeamStrokesOverride({ team_strokes_override: { team1: 5, team2: 0 } }),
    ).toEqual({ team1: 5, team2: 0 });
  });
});
