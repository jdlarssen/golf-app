import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

// --- Module mocks (kun wiring-testene, #1537) -----------------------------

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}));

// -------------------------------------------------------------------------

import {
  planHandicapRecompute,
  planGreensomeOverrideRecompute,
  recomputeCourseHandicapForUser,
  type RecomputeGameRow,
  type GreensomeOverrideRow,
} from './recomputeCourseHandicap';
import { getAdminClient } from '@/lib/supabase/admin';
import type { TeeBoxRatings } from './teeRating';

// A men's rating-set chosen so the course-handicap formula is trivial to
// assert: slope 113 and course_rating == par make
//   raw = hcpIndex * (113/113) + (par - par) = hcpIndex
// so course handicap == round(hcpIndex) before allowance.
const TEE: TeeBoxRatings = {
  slope_mens: 113,
  course_rating_mens: 72,
  par_total_mens: 72,
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

function activeRow(overrides: Partial<RecomputeGameRow> = {}): RecomputeGameRow {
  return {
    gameId: 'g-active',
    status: 'active',
    courseHandicap: 18,
    teeGender: 'mens',
    teeRatings: TEE,
    allowancePct: 100,
    ...overrides,
  };
}

describe('planHandicapRecompute (#1176)', () => {
  it('empty input → no updates', () => {
    expect(planHandicapRecompute([], 12)).toEqual([]);
  });

  it('active game with a frozen CH → one recomputed update', () => {
    // hcpIndex 12 on the trivial tee, 100% allowance → CH 12.
    expect(planHandicapRecompute([activeRow()], 12)).toEqual([
      { gameId: 'g-active', courseHandicap: 12 },
    ]);
  });

  it('applies the format allowance percentage', () => {
    // hcpIndex 20 → raw 20; 75% allowance → round(15) = 15.
    expect(
      planHandicapRecompute([activeRow({ allowancePct: 75 })], 20),
    ).toEqual([{ gameId: 'g-active', courseHandicap: 15 }]);
  });

  it.each([
    ['finished', 'finished' as const],
    ['scheduled', 'scheduled' as const],
    ['draft', 'draft' as const],
  ])('skips %s games (never rewrite non-active rounds)', (_label, status) => {
    expect(planHandicapRecompute([activeRow({ status })], 12)).toEqual([]);
  });

  it('skips active rows whose CH is not yet frozen (null)', () => {
    expect(
      planHandicapRecompute([activeRow({ courseHandicap: null })], 12),
    ).toEqual([]);
  });

  it('skips rows whose tee has no rating-set for the chosen gender', () => {
    // TEE only carries a men's set; a ladies player cannot be recomputed.
    expect(
      planHandicapRecompute([activeRow({ teeGender: 'ladies' })], 12),
    ).toEqual([]);
  });

  it('skips rows with a missing tee entirely', () => {
    expect(
      planHandicapRecompute([activeRow({ teeRatings: null })], 12),
    ).toEqual([]);
  });

  it.each([[NaN], [Infinity], [-Infinity]])(
    'non-finite hcp index (%p) → no updates (never write NaN)',
    (bad) => {
      expect(planHandicapRecompute([activeRow()], bad)).toEqual([]);
    },
  );

  // Prod-fikstur fra Ryder Cup 2026 (2026-08-08): en spiller registrerte
  // plusshandicapet sitt uten «+», så +2,2 ble lagret som 2,2. Spillene frøs
  // CH 3 kl. 07:50; profilen ble rettet til −2,2 kl. 09:08 — men rettingen gikk
  // via /profile, som den gang ikke kalte recompute, så CH ble stående på 3.
  // Fem slag for mye. Låser fortegnet gjennom hele freeze-pipelinen.
  it('plusshandicap (negativ index) → negativ course handicap', () => {
    const mensII: TeeBoxRatings = {
      ...TEE,
      slope_mens: 140,
      course_rating_mens: 71.5,
      par_total_mens: 71,
    };
    // -2.2 * (140/113) + (71.5 - 71) = -2.2257 → round → -2
    expect(
      planHandicapRecompute(
        [activeRow({ courseHandicap: 3, teeRatings: mensII })],
        -2.2,
      ),
    ).toEqual([{ gameId: 'g-active', courseHandicap: -2 }]);
  });

  it('mixed rows → only active + frozen + resolvable are updated', () => {
    const rows: RecomputeGameRow[] = [
      activeRow({ gameId: 'a1' }), // update
      activeRow({ gameId: 'finished-1', status: 'finished' }), // skip
      activeRow({ gameId: 'scheduled-1', status: 'scheduled' }), // skip
      activeRow({ gameId: 'a2-nullch', courseHandicap: null }), // skip
      activeRow({ gameId: 'a3-badtee', teeGender: 'juniors' }), // skip (no jr set)
      activeRow({ gameId: 'a4' }), // update
    ];
    expect(planHandicapRecompute(rows, 12)).toEqual([
      { gameId: 'a1', courseHandicap: 12 },
      { gameId: 'a4', courseHandicap: 12 },
    ]);
  });
});

// ─── planGreensomeOverrideRecompute (#1537) ──────────────────────────────
//
// Prod-fikstur: Ryder Cup 2026, Greensome 2 (2026-08-08). Lag 1 = CH 12 + 16
// → lagret 14 (= formelen). Lag 2 = Burgern CH 50 + Sander CH 3 → lagret 22
// (= formelen med Sanders GAMLE, feilregistrerte handicap). Sander rettes til
// CH −2 → riktig lag-slag er greensomeTeamHandicap(50, −2) = 19.

/** Sanders rad i Greensome 2 slik den ser ut RETT ETTER CH-rettingen. */
function greensomeRow(
  overrides: Partial<GreensomeOverrideRow> = {},
): GreensomeOverrideRow {
  return {
    gameId: 'greensome-2',
    status: 'active',
    gameMode: 'greensome_matchplay',
    modeConfig: {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100,
      team_strokes_override: { team1: 14, team2: 22 },
    },
    teamNumber: 2,
    previousCourseHandicap: 3,
    newCourseHandicap: -2,
    teammateCourseHandicap: 50,
    ...overrides,
  };
}

describe('planGreensomeOverrideRecompute (#1537)', () => {
  it('empty input → no updates', () => {
    expect(planGreensomeOverrideRecompute([])).toEqual([]);
  });

  it('lagret verdi == formelen med gammel CH → regnes om, motstanderlaget urørt', () => {
    // formel(50, 3) = 22 == lagret → formel(50, −2) = 19. Lag 1 (14) står.
    expect(planGreensomeOverrideRecompute([greensomeRow()])).toEqual([
      {
        gameId: 'greensome-2',
        teamStrokesOverride: { team1: 14, team2: 19 },
      },
    ]);
  });

  it('hånd-redigert verdi (≠ formelen med gammel CH) overlever', () => {
    // Arrangøren har skrevet 20 selv — det er ikke auto-forslaget (22).
    expect(
      planGreensomeOverrideRecompute([
        greensomeRow({
          modeConfig: {
            kind: 'greensome_matchplay',
            team_strokes_override: { team1: 14, team2: 20 },
          },
        }),
      ]),
    ).toEqual([]);
  });

  it('rettet spiller på lag 1 → kun team1 endres', () => {
    // formel(16, 12) = 14 == lagret team1 → ny CH 8 gir formel(16, 8) = 11.
    expect(
      planGreensomeOverrideRecompute([
        greensomeRow({
          teamNumber: 1,
          previousCourseHandicap: 12,
          newCourseHandicap: 8,
          teammateCourseHandicap: 16,
        }),
      ]),
    ).toEqual([
      {
        gameId: 'greensome-2',
        teamStrokesOverride: { team1: 11, team2: 22 },
      },
    ]);
  });

  it('ny CH gir samme lag-slag → ingen skriving', () => {
    // formel(50, 3) = 22 og formel(50, 4) = 22 → verdien er allerede riktig.
    expect(
      planGreensomeOverrideRecompute([
        greensomeRow({ newCourseHandicap: 4 }),
      ]),
    ).toEqual([]);
  });

  it.each([
    ['finished', 'finished' as const],
    ['scheduled', 'scheduled' as const],
    ['draft', 'draft' as const],
  ])('skips %s games (aldri rør ferdige eller ustartede runder)', (_l, status) => {
    expect(planGreensomeOverrideRecompute([greensomeRow({ status })])).toEqual(
      [],
    );
  });

  it('ikke-greensome modus → aldri rørt (feltet betyr ingenting der)', () => {
    expect(
      planGreensomeOverrideRecompute([
        greensomeRow({ gameMode: 'foursomes_matchplay' }),
      ]),
    ).toEqual([]);
  });

  it('mode_config uten overstyring → ingenting å regne om', () => {
    expect(
      planGreensomeOverrideRecompute([
        greensomeRow({
          modeConfig: { kind: 'greensome_matchplay', allowance_pct: 100 },
        }),
      ]),
    ).toEqual([]);
  });

  it.each([
    ['null', null],
    ['tom', {}],
    ['halv overstyring', { team_strokes_override: { team1: 14 } }],
    [
      'ikke-numerisk',
      { team_strokes_override: { team1: 14, team2: '22' } },
    ],
  ])('malformed mode_config (%s) → urørt', (_label, modeConfig) => {
    expect(
      planGreensomeOverrideRecompute([greensomeRow({ modeConfig })]),
    ).toEqual([]);
  });

  it('lagkamerat mangler CH (null) → urørt (ingen formel-input)', () => {
    expect(
      planGreensomeOverrideRecompute([
        greensomeRow({ teammateCourseHandicap: null }),
      ]),
    ).toEqual([]);
  });

  it('egen CH var ikke frosset (null) → urørt', () => {
    expect(
      planGreensomeOverrideRecompute([
        greensomeRow({ previousCourseHandicap: null }),
      ]),
    ).toEqual([]);
  });

  it.each([[1], [2], [null], [3]])(
    'lagnummer %p: kun 1 og 2 kan regnes om',
    (teamNumber) => {
      const updates = planGreensomeOverrideRecompute([
        greensomeRow({
          teamNumber,
          // Gjør rad-en gyldig for BEGGE sider: formelen med gammel CH gir 22,
          // som er lagret på team2; team1 (14) er formel(12, 16).
          previousCourseHandicap: teamNumber === 1 ? 12 : 3,
          teammateCourseHandicap: teamNumber === 1 ? 16 : 50,
        }),
      ]);
      expect(updates).toHaveLength(teamNumber === 1 || teamNumber === 2 ? 1 : 0);
    },
  );

  it('kjeder korrekt når begge lagkamerater rettes sekvensielt', () => {
    // Pass 1: Sander 3 → −2 skriver team2 = formel(50, −2) = 19.
    const pass1 = planGreensomeOverrideRecompute([greensomeRow()]);
    expect(pass1).toEqual([
      { gameId: 'greensome-2', teamStrokesOverride: { team1: 14, team2: 19 } },
    ]);

    // Pass 2: Burgern 50 → 48, med lagkamerat Sander på den NYE CH-en (−2) og
    // den verdien pass 1 skrev. formel(50, −2) = 19 == lagret → skriver videre
    // til formel(48, −2) = 18.
    expect(
      planGreensomeOverrideRecompute([
        greensomeRow({
          modeConfig: {
            kind: 'greensome_matchplay',
            team_strokes_override: pass1[0].teamStrokesOverride,
          },
          previousCourseHandicap: 50,
          newCourseHandicap: 48,
          teammateCourseHandicap: -2,
        }),
      ]),
    ).toEqual([
      { gameId: 'greensome-2', teamStrokesOverride: { team1: 14, team2: 18 } },
    ]);
  });

  it('flere kamper vurderes hver for seg', () => {
    const rows: GreensomeOverrideRow[] = [
      greensomeRow({ gameId: 'g1' }), // omregnes
      greensomeRow({ gameId: 'g2', status: 'finished' }), // skip
      greensomeRow({
        gameId: 'g3',
        modeConfig: {
          kind: 'greensome_matchplay',
          team_strokes_override: { team1: 14, team2: 20 },
        },
      }), // hånd-redigert → skip
      greensomeRow({ gameId: 'g4', newCourseHandicap: 0 }), // formel(50,0)=20
    ];
    expect(planGreensomeOverrideRecompute(rows)).toEqual([
      { gameId: 'g1', teamStrokesOverride: { team1: 14, team2: 19 } },
      { gameId: 'g4', teamStrokesOverride: { team1: 14, team2: 20 } },
    ]);
  });
});

// ─── recomputeCourseHandicapForUser — greensome-wiring (#1537) ───────────

const mockAdminClient = vi.mocked(getAdminClient);

/** Ryder Cup-tee-en fra prod-fiksturen (−2,2 → CH −2, 3,0-index → CH 3). */
const MENS_II: TeeBoxRatings = {
  ...TEE,
  slope_mens: 140,
  course_rating_mens: 71.5,
  par_total_mens: 71,
};

const GREENSOME_CONFIG = {
  kind: 'greensome_matchplay',
  team_size: 2,
  teams_count: 2,
  allowance_pct: 100,
  team_strokes_override: { team1: 14, team2: 22 },
};

function greensomeQueue(
  configOverride: Record<string, unknown> = GREENSOME_CONFIG,
): QueryResult[] {
  return [
    // 1) medlemskap for brukeren (frosset CH FØR rettingen)
    {
      data: [
        {
          game_id: 'greensome-2',
          tee_gender: 'mens',
          course_handicap: 3,
          team_number: 2,
        },
      ],
      error: null,
    },
    // 2) spillene
    {
      data: [
        {
          id: 'greensome-2',
          status: 'active',
          hcp_allowance_pct: 100,
          tee_boxes: MENS_II,
          game_mode: 'greensome_matchplay',
          mode_config: configOverride,
        },
      ],
      error: null,
    },
    // 3) CH-skrivingen
    { data: [{ game_id: 'greensome-2' }], error: null },
    // 4) lagkameraten
    {
      data: [
        {
          game_id: 'greensome-2',
          user_id: 'burgern',
          team_number: 2,
          course_handicap: 50,
          withdrawn_at: null,
        },
      ],
      error: null,
    },
    // 5) mode_config-skrivingen
    { data: [{ id: 'greensome-2' }], error: null },
  ];
}

describe('recomputeCourseHandicapForUser — greensome-overstyring (#1537)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-foreslått overstyring: skrives om og cachen revalideres', async () => {
    const client = buildSupabaseMock(greensomeQueue());
    mockAdminClient.mockReturnValue(client as never);

    expect(await recomputeCourseHandicapForUser('sander', -2.2)).toEqual({
      updated: 1,
      overridesUpdated: 1,
    });

    const write = client.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'update',
    );
    // Øvrige mode_config-nøkler overlever merge-en.
    expect(write?.args[0]).toEqual({
      mode_config: {
        kind: 'greensome_matchplay',
        team_size: 2,
        teams_count: 2,
        allowance_pct: 100,
        team_strokes_override: { team1: 14, team2: 19 },
      },
    });
    expect(revalidateTagMock).toHaveBeenCalledWith('game-greensome-2', 'max');
    // To revalideringer: én etter CH-skrivingen (#1629), én etter mode_config-
    // skrivingen — den siste må komme etterpå for at kampbrettet skal lese det
    // nye lag-slaget.
    expect(revalidateTagMock).toHaveBeenCalledTimes(2);
  });

  it('hånd-redigert overstyring: mode_config skrives ikke; kun CH-revalideringen kjører', async () => {
    const client = buildSupabaseMock(
      greensomeQueue({ ...GREENSOME_CONFIG, team_strokes_override: { team1: 14, team2: 20 } }),
    );
    mockAdminClient.mockReturnValue(client as never);

    expect(await recomputeCourseHandicapForUser('sander', -2.2)).toEqual({
      updated: 1,
      overridesUpdated: 0,
    });
    expect(
      client.__fromCalls.some((c) => c.table === 'games' && c.method === 'update'),
    ).toBe(false);
    // Kun CH-revalideringen (#1629) — mode_config ble aldri skrevet.
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
  });

  it('feilende mode_config-skriving stopper ikke omregningen (best-effort)', async () => {
    const queue = greensomeQueue();
    queue[4] = { data: null, error: { message: 'boom' } };
    const client = buildSupabaseMock(queue);
    mockAdminClient.mockReturnValue(client as never);

    expect(await recomputeCourseHandicapForUser('sander', -2.2)).toEqual({
      updated: 1,
      overridesUpdated: 0,
    });
    // CH-revalideringen (#1629) står; den feilende mode_config-skrivingen
    // legger ingen ny til.
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
  });
});

// ─── recomputeCourseHandicapForUser — cache-revalidering (#1629) ─────────

/** Ett vanlig (ikke-greensome) aktivt spill med frosset banehandicap. */
function plainQueue(writeResult: QueryResult): QueryResult[] {
  return [
    // 1) medlemskap
    {
      data: [
        {
          game_id: 'g-1',
          tee_gender: 'mens',
          course_handicap: 18,
          team_number: null,
        },
      ],
      error: null,
    },
    // 2) spillet
    {
      data: [
        {
          id: 'g-1',
          status: 'active',
          hcp_allowance_pct: 100,
          tee_boxes: TEE,
          game_mode: 'stableford',
          mode_config: null,
        },
      ],
      error: null,
    },
    // 3) CH-skrivingen
    writeResult,
  ];
}

describe('recomputeCourseHandicapForUser — cache-revalidering (#1629)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skrevet banehandicap → spill-cachen revalideres', async () => {
    mockAdminClient.mockReturnValue(
      buildSupabaseMock(plainQueue({ data: [{ game_id: 'g-1' }], error: null })) as never,
    );

    expect(await recomputeCourseHandicapForUser('sander', 12)).toEqual({
      updated: 1,
      overridesUpdated: 0,
    });
    expect(revalidateTagMock).toHaveBeenCalledWith('game-g-1', 'max');
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
  });

  it('0-raders skriving → ingen revalidering', async () => {
    mockAdminClient.mockReturnValue(
      buildSupabaseMock(plainQueue({ data: [], error: null })) as never,
    );

    expect(await recomputeCourseHandicapForUser('sander', 12)).toEqual({
      updated: 0,
      overridesUpdated: 0,
    });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
