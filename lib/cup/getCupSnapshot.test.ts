import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Regression test for #642: getCupSnapshot crashed with a 500 (Postgres 42703
 * `column course_holes.par does not exist`) for any cup with ≥1 match, because
 * the `course_holes` select still referenced the `par` column dropped in
 * migration 0040 (replaced by par_mens/par_ladies/par_juniors).
 *
 * The actual runtime crash only reproduces against real Postgres, so the live
 * proof is the Supabase schema check (K3). This test locks the column-name
 * contract so a revert to bare `par` fails CI: it drives a minimal 1-match cup
 * through the loader and asserts the course_holes select requests the per-gender
 * columns and never a standalone `par`.
 */

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => supabaseMock,
}));

describe('getCupSnapshot — course_holes par-select (#642)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects per-gender par columns, never the dropped `par`', async () => {
    supabaseMock = buildSupabaseMock([
      // 1. tournaments.maybeSingle
      {
        data: {
          id: 't1',
          name: 'Test-cup',
          team_1_name: 'Lag A',
          team_2_name: 'Lag B',
          points_to_win: 1,
          status: 'active',
          winner_team: null,
          created_by: 'admin',
          created_at: '2026-06-15T10:00:00Z',
          started_at: null,
          finished_at: null,
          group_id: null,
          win_points: 1,
          tie_points: 0.5,
        },
      },
      // 2. games (≥1 → triggers the course_holes fetch that used to crash)
      {
        data: [
          {
            id: 'g1',
            name: 'Test-cup – Match 1',
            status: 'finished',
            game_mode: 'singles_matchplay',
            mode_config: null,
            tournament_match_label: 'Match 1',
            course_id: 'c1',
            tee_box_id: 'tb1',
            created_at: '2026-06-15T10:05:00Z',
            hole_segment: 'full',
            source_game_id: null,
            score_visibility: 'live',
          },
        ],
      },
      // 3. tournament_side_awards (#1441, D9) — none configured for this cup.
      { data: [] },
      // 4. Promise.all → game_players, scores, course_holes (in array order)
      {
        data: [
          { game_id: 'g1', user_id: 'u1', team_number: 1, course_handicap: 0, users: { name: 'Spiller 1', nickname: null } },
          { game_id: 'g1', user_id: 'u2', team_number: 2, course_handicap: 0, users: { name: 'Spiller 2', nickname: null } },
        ],
      },
      { data: [] }, // scores
      {
        data: [
          { course_id: 'c1', hole_number: 1, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 1 },
        ],
      },
    ]);

    const { getCupSnapshot } = await import('@/lib/cup/getCupSnapshot');
    const snap = await getCupSnapshot('t1', 'Ukjent spiller');
    expect(snap).not.toBeNull();

    const holesSelect = supabaseMock.__fromCalls.find(
      (c) => c.table === 'course_holes' && c.method === 'select',
    );
    expect(holesSelect, 'course_holes select was issued').toBeDefined();
    const cols = holesSelect!.args[0] as string;
    expect(cols).toContain('par_mens');
    expect(cols).toContain('par_ladies');
    expect(cols).toContain('par_juniors');
    // No standalone `par` token — that would re-introduce the 42703 crash.
    expect(cols).not.toMatch(/(^|[\s,])par($|[\s,])/);
  });
});

/**
 * #1441 (F3b): splittet-cup-dag-bunten i getCupSnapshot — best-ball-host
 * scoret på netto lagtotal (ikke matchplay-dispatch), avledet singles som
 * leser host-ens scores filtrert på sitt eget segment, D12 blind-gating
 * (reveal + ikke-finished skjuler ellers avgjørbare resultater; 'live'
 * beholder dagens oppførsel), D8 vektede poeng og D9 sidepoeng.
 *
 * Én flight-lignende fixture (3 games under samme cup) dekker alt i én
 * kjøring — se inline-kommentarer per game for hva hver rad beviser.
 */
describe('getCupSnapshot — splittet cup-dag (#1441)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function player(id: string, team: 1 | 2) {
    return { user_id: id, team_number: team, course_handicap: 0, users: { name: id, nickname: null } };
  }

  it('best-ball host (netto lagtotal), avledet singles (source_game_id + segment), D12 blind-gating, D8-vekter, D9-sidepoeng', async () => {
    supabaseMock = buildSupabaseMock([
      // 1. tournaments — win_points/tie_points 5/2 (D8, denne dagens vekter).
      {
        data: {
          id: 't1',
          name: 'Splittet cup-dag',
          team_1_name: 'Nord',
          team_2_name: 'Sør',
          points_to_win: null,
          status: 'active',
          winner_team: null,
          created_by: 'admin',
          created_at: '2026-08-06T08:00:00Z',
          started_at: '2026-08-06T09:00:00Z',
          finished_at: null,
          group_id: null,
          win_points: 5,
          tie_points: 2,
        },
      },
      // 2. games: g1 = best-ball host (back9, reveal, finished — resultatet
      //    SKAL vises + telle poeng). g2 = avledet singles (back9,
      //    source_game_id=g1, reveal, STILL active — D12 skal skjule et
      //    ellers avgjørbart resultat). g3 = greensome host (front9, LIVE
      //    default, active — dagens oppførsel: avgjort resultat vises selv
      //    om spillet ikke er finished; poengene teller uansett ikke før
      //    finished).
      {
        data: [
          {
            id: 'g1',
            name: 'Splittet cup-dag – Best ball 1',
            status: 'finished',
            game_mode: 'best_ball',
            // #1539/#1551: best_ball har ingen `allowance_pct` i mode_config —
            // allowancen bor på `games.hcp_allowance_pct` og er alt trukket fra
            // i det frosne banehandicapet.
            mode_config: { kind: 'best_ball', team_size: 2, teams_count: 2 },
            tournament_match_label: 'Best ball 1',
            course_id: 'c1',
            tee_box_id: 'tb1',
            created_at: '2026-08-06T09:00:00Z',
            hole_segment: 'back9',
            source_game_id: null,
            score_visibility: 'reveal',
          },
          {
            id: 'g2',
            name: 'Splittet cup-dag – Singel 1',
            status: 'active',
            game_mode: 'singles_matchplay',
            mode_config: null,
            tournament_match_label: 'Singel 1',
            course_id: 'c1',
            tee_box_id: 'tb1',
            created_at: '2026-08-06T09:00:01Z',
            hole_segment: 'back9',
            source_game_id: 'g1',
            score_visibility: 'reveal',
          },
          {
            id: 'g3',
            name: 'Splittet cup-dag – Greensome 1',
            status: 'active',
            game_mode: 'greensome_matchplay',
            mode_config: null,
            tournament_match_label: 'Greensome 1',
            course_id: 'c1',
            tee_box_id: 'tb1',
            created_at: '2026-08-06T09:00:02Z',
            hole_segment: 'front9',
            source_game_id: null,
            score_visibility: 'live',
          },
        ],
      },
      // 3. tournament_side_awards (D9): ld-poeng vunnet av p6 (Nord/team1).
      {
        data: [
          { id: 'sa1', kind: 'ld', hole_number: 6, points: 3, winner_user_id: 'p6', slot: 1, gir_max_per_team: null, gir_team1_count: null, gir_team2_count: null },
        ],
      },
      // 4. Promise.all → game_players, scores, course_holes.
      {
        data: [
          { game_id: 'g1', ...player('p1', 1) },
          { game_id: 'g1', ...player('p2', 1) },
          { game_id: 'g1', ...player('p3', 2) },
          { game_id: 'g1', ...player('p4', 2) },
          { game_id: 'g2', ...player('p1', 1) },
          { game_id: 'g2', ...player('p3', 2) },
          { game_id: 'g3', ...player('p5', 1) },
          { game_id: 'g3', ...player('p6', 1) },
          { game_id: 'g3', ...player('p7', 2) },
          { game_id: 'g3', ...player('p8', 2) },
        ],
      },
      {
        // g2 (avledet) har INGEN egne rader — leses fra g1 via source_game_id.
        // g3 (greensome/alternate-shot) bærer scoren kun på lagets
        // lex-min-userId («kaptein»), samme mønster som
        // computeCupMatchResult.test.ts.
        data: [
          { game_id: 'g1', user_id: 'p1', hole_number: 10, strokes: 4 },
          { game_id: 'g1', user_id: 'p2', hole_number: 10, strokes: 6 },
          { game_id: 'g1', user_id: 'p3', hole_number: 10, strokes: 5 },
          { game_id: 'g1', user_id: 'p4', hole_number: 10, strokes: 5 },
          { game_id: 'g3', user_id: 'p5', hole_number: 1, strokes: 4 },
          { game_id: 'g3', user_id: 'p7', hole_number: 1, strokes: 5 },
        ],
      },
      {
        data: [
          { course_id: 'c1', hole_number: 1, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 1 },
          { course_id: 'c1', hole_number: 10, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 1 },
        ],
      },
    ]);

    const { getCupSnapshot } = await import('@/lib/cup/getCupSnapshot');
    const snap = await getCupSnapshot('t1', 'Ukjent spiller');
    expect(snap).not.toBeNull();

    const byId = (id: string) => snap!.leaderboard.matches.find((m) => m.gameId === id)!;

    // g1 — best-ball host: netto lagtotal (side1 4 < side2 5), finished →
    // resultat vises OG teller D8-vektede poeng (win_points 5, ikke default 1).
    const g1 = byId('g1');
    expect(g1.result).toEqual({ winnerSide: 1, formatted: '4–5' });
    expect(g1.pointsTeam1).toBe(5);
    expect(g1.pointsTeam2).toBe(0);
    // #1497: per-side spiller-ID-er eksponert for per-spiller-regnskapet.
    expect(g1.team1UserIds).toEqual(['p1', 'p2']);
    expect(g1.team2UserIds).toEqual(['p3', 'p4']);

    // g2 — avledet singles: leser g1s scores (source_game_id) filtrert til
    // back9 (hull 10 finnes, hull 1 er utenfor scope). Scorene AVGJØR
    // matchen (p1 slår p3 på hull 10) — men reveal + active (ikke finished)
    // → D12 skjuler resultatet uansett avgjørbarhet.
    const g2 = byId('g2');
    expect(g2.result).toBeNull();
    expect(g2.pointsTeam1).toBe(0);
    expect(g2.pointsTeam2).toBe(0);

    // g3 — greensome host, 'live' (ikke reveal): dagens oppførsel bevart —
    // et avgjort resultat vises FØR finished. Poengene teller likevel ikke
    // (status !== 'finished') — points-gatingen var allerede riktig.
    const g3 = byId('g3');
    expect(g3.result).not.toBeNull();
    expect(g3.result?.winnerSide).toBe(1);
    expect(g3.pointsTeam1).toBe(0);
    expect(g3.pointsTeam2).toBe(0);

    // D9 — sidepoeng: p6 er team1 (Nord) via rosteret bygget fra g3s
    // game_players → winnerTeam utledes riktig, poengene legges til team1s
    // totalsum ovenpå match-poengene.
    expect(snap!.sideAwards).toEqual([
      { id: 'sa1', kind: 'ld', holeNumber: 6, points: 3, slot: 1, slotCount: 1, winnerUserId: 'p6', winnerTeam: 1, noWinner: false },
    ]);
    expect(snap!.leaderboard.sideAwardPoints).toEqual({ team1: 3, team2: 0 });
    // Total = g1s 5 (best-ball-seier) + 3 (sidepoeng) — g2/g3 bidrar 0.
    expect(snap!.leaderboard.team1Points).toBe(8);
    expect(snap!.leaderboard.team2Points).toBe(0);

    // #1508 — prestasjons-input for «dro ned mest». Denne fixturen er nettopp
    // dobbelttellings-fella: g2 (avledet singles) leser g1s score-rader. Kun
    // g1 slipper inn, så scoresettet telles ÉN gang. g3 (greensome) fører
    // lagball og holdes utenfor uansett.
    expect(snap!.performanceInputs.map((p) => p.gameId)).toEqual(['g1']);
    const perf = snap!.performanceInputs[0];
    // Segment-filtrert (back9): hull 1 er med i course_holes, men ikke i scope.
    expect(perf.holes).toEqual([{ number: 10, par: 4, strokeIndex: 1 }]);
    expect(perf.players).toEqual([
      { userId: 'p1', courseHandicap: 0 },
      { userId: 'p2', courseHandicap: 0 },
      { userId: 'p3', courseHandicap: 0 },
      { userId: 'p4', courseHandicap: 0 },
    ]);
    expect(perf.scores).toHaveLength(4);
    expect(perf.scores[0]).toEqual({ userId: 'p1', holeNumber: 10, strokes: 4 });
    // ...og uten nye DB-lesinger: prestasjons-inputen bygges av data loopen
    // allerede hadde. Tabell-settet er uendret fra før #1508.
    expect(new Set(supabaseMock.__fromCalls.map((c) => c.table))).toEqual(
      new Set(['tournaments', 'games', 'tournament_side_awards', 'game_players', 'scores', 'course_holes']),
    );
  });
});

/**
 * #1489: flere vinner-plasser per (type, hull) — slot-rader med `slotCount`
 * for «1 av 3»-nummereringen — og GIR-rader som foldes ut til ett
 * leaderboard-innslag per klarte GIR per lag (poeng = teller × points, med
 * desimalpoeng bevart). Null-tellere (uregistrert) og eksplisitt 0 gir begge
 * ingen innslag.
 */
describe('getCupSnapshot — sidepoeng-slots + GIR (#1489)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ctp-slots får slotCount, GIR foldes til lag-innslag med desimalpoeng', async () => {
    supabaseMock = buildSupabaseMock([
      // 1. tournaments — default-vekter.
      {
        data: {
          id: 't1',
          name: 'Slots-cup',
          team_1_name: 'Nord',
          team_2_name: 'Sør',
          points_to_win: null,
          status: 'active',
          winner_team: null,
          created_by: 'admin',
          created_at: '2026-08-07T08:00:00Z',
          started_at: '2026-08-07T09:00:00Z',
          finished_at: null,
          group_id: null,
          win_points: 1,
          tie_points: 0.5,
        },
      },
      // 2. games: én singles-match gir rosteret (u1 → team1, u2 → team2).
      {
        data: [
          {
            id: 'g1',
            name: 'Slots-cup – Match 1',
            status: 'active',
            game_mode: 'singles_matchplay',
            mode_config: null,
            tournament_match_label: 'Match 1',
            course_id: 'c1',
            tee_box_id: 'tb1',
            created_at: '2026-08-07T09:00:00Z',
            hole_segment: 'full',
            source_game_id: null,
            score_visibility: 'live',
          },
        ],
      },
      // 3. tournament_side_awards (sortert kind/hull/slot, som .order gir):
      //    3×ctp hull 4 (slot 1 vunnet av u1/team1, slot 2 av u2/team2, slot 3
      //    uregistrert), gir hull 3 med tellere 2/0, gir hull 7 uregistrert.
      {
        data: [
          { id: 'sa1', kind: 'ctp', hole_number: 4, points: 2, winner_user_id: 'u1', slot: 1, gir_max_per_team: null, gir_team1_count: null, gir_team2_count: null },
          { id: 'sa2', kind: 'ctp', hole_number: 4, points: 2, winner_user_id: 'u2', slot: 2, gir_max_per_team: null, gir_team1_count: null, gir_team2_count: null },
          { id: 'sa3', kind: 'ctp', hole_number: 4, points: 2, winner_user_id: null, slot: 3, gir_max_per_team: null, gir_team1_count: null, gir_team2_count: null },
          { id: 'sa4', kind: 'gir', hole_number: 3, points: 1.5, winner_user_id: null, slot: 1, gir_max_per_team: 3, gir_team1_count: 2, gir_team2_count: 0 },
          { id: 'sa5', kind: 'gir', hole_number: 7, points: 1, winner_user_id: null, slot: 1, gir_max_per_team: 2, gir_team1_count: null, gir_team2_count: null },
          // #1530: arrangøren har svart «ingen vant» på hull 9 — registrert,
          // men uten vinner. Skiller seg fra sa3 (ikke tastet ennå).
          { id: 'sa6', kind: 'ld', hole_number: 9, points: 4, winner_user_id: null, no_winner: true, slot: 1, gir_max_per_team: null, gir_team1_count: null, gir_team2_count: null },
        ],
      },
      // 4. Promise.all → game_players, scores, course_holes.
      {
        data: [
          { game_id: 'g1', user_id: 'u1', team_number: 1, course_handicap: 0, users: { name: 'Spiller 1', nickname: null } },
          { game_id: 'g1', user_id: 'u2', team_number: 2, course_handicap: 0, users: { name: 'Spiller 2', nickname: null } },
        ],
      },
      { data: [] }, // scores
      {
        data: [
          { course_id: 'c1', hole_number: 1, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 1 },
        ],
      },
    ]);

    const { getCupSnapshot } = await import('@/lib/cup/getCupSnapshot');
    const snap = await getCupSnapshot('t1', 'Ukjent spiller');
    expect(snap).not.toBeNull();

    expect(snap!.sideAwards).toEqual([
      { id: 'sa1', kind: 'ctp', holeNumber: 4, points: 2, slot: 1, slotCount: 3, winnerUserId: 'u1', winnerTeam: 1, noWinner: false },
      { id: 'sa2', kind: 'ctp', holeNumber: 4, points: 2, slot: 2, slotCount: 3, winnerUserId: 'u2', winnerTeam: 2, noWinner: false },
      { id: 'sa3', kind: 'ctp', holeNumber: 4, points: 2, slot: 3, slotCount: 3, winnerUserId: null, winnerTeam: null, noWinner: false },
      { id: 'sa4', kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 3, team1Count: 2, team2Count: 0 },
      { id: 'sa5', kind: 'gir', holeNumber: 7, points: 1, maxPerTeam: 2, team1Count: null, team2Count: null },
      // #1530: «ingen vant» kommer ut som noWinner true med winnerTeam null —
      // skilt fra sa3, som er samme null-vinner men UTEN svar.
      { id: 'sa6', kind: 'ld', holeNumber: 9, points: 4, slot: 1, slotCount: 1, winnerUserId: null, winnerTeam: null, noWinner: true },
    ]);

    // team1: ctp slot 1 (2 p) + 2 × gir 1,5 p = 5. team2: ctp slot 2 (2 p) +
    // eksplisitt 0 gir = 2. Uregistrerte innslag (slot 3, gir hull 7) bidrar 0
    // — og det samme gjør «ingen vant» (sa6, 4 p som ingen får, #1530).
    expect(snap!.leaderboard.sideAwardPoints).toEqual({ team1: 5, team2: 2 });
    expect(snap!.leaderboard.team1Points).toBe(5);
    expect(snap!.leaderboard.team2Points).toBe(2);
  });
});
