/**
 * Generalprøven av Kavalkaden (#3020, B2): skriver golfåret fra
 * `lib/kavalkade/__fixtures__/golfaar3020.ts` til STAGING, så siden kan åpnes
 * mot fasiten. Skriptet nekter alt som ikke er staging.
 *
 * Kjør fra arbeidskopiens rot, med Node 22:
 *
 *   npx tsx --env-file=.env.staging.local --tsconfig scripts/tsconfig.json \
 *     scripts/kavalkade-generalproeve.ts --run 1
 *
 * Hver kjøring er en egen gjeng: sju nye testbrukere (`scripts/dev-login-users.mjs`,
 * e-post `torny+dev-3020-r<n>-<a…g>@example.test`), en egen bane med tee, en liga
 * med én runde, og de ti spillene. Radene i `kavalkades` er endelige, og byggeren
 * sletter aldri rader, så en ny prøve etter en retting kjøres som `--run <n+1>`.
 * En kjøring som alt finnes, nektes.
 *
 * `result_summary` regnes med `persistResultSummaries`, den samme motoren som
 * `endGame` kaller, og leses tilbake og sammenliknes med fasiten. Spillene får
 * `finish_pipeline_at` satt, så en hånd-kjørt cron-sveip ikke sender varsler
 * eller kaller AI for dem.
 *
 * Skriptet skriver ut id-ene det lagde (aldri e-post eller nøkler), så
 * orkestratoren kan rydde etter prøven.
 */
import { spawnSync } from 'node:child_process';
import { getAdminClient } from '@/lib/supabase/admin';
import { persistResultSummaries } from '@/lib/games/persistResultSummaries';
import { scriptTargetRefusal, supabaseTargetOf } from '@/lib/supabaseTarget';
import {
  GOLFAAR_COURSE,
  GOLFAAR_GAMES,
  GOLFAAR_PLAYERS,
  golfaarStrokesOf,
  type GolfaarPlayerKey,
} from '@/lib/kavalkade/__fixtures__/golfaar3020';

type Admin = ReturnType<typeof getAdminClient>;

const KEYS = Object.keys(GOLFAAR_PLAYERS) as GolfaarPlayerKey[];

function runNumber(): number {
  const i = process.argv.indexOf('--run');
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('Bruk: --run <n> (et heltall fra 1). Hver kjøring lager en ny gjeng.');
  }
  return n;
}

const emailOf = (run: number, key: GolfaarPlayerKey) =>
  `torny+dev-3020-r${run}-${key.toLowerCase()}@example.test`;

/** Kaster ved feil, og sier hvilket steg som feilet. */
function must<T>(step: string, res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(`${step}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${step}: no data`);
  return res.data;
}

/** JSON med sorterte nøkler, så to like objekter gir samme tekst. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function createUsers(run: number): void {
  for (const key of KEYS) {
    const res = spawnSync(
      'node',
      [
        'scripts/dev-login-users.mjs',
        'add',
        '--email',
        emailOf(run, key),
        '--name',
        GOLFAAR_PLAYERS[key].name,
        '--issue',
        '3020',
      ],
      { encoding: 'utf8' },
    );
    if (res.status !== 0) {
      throw new Error(`dev-login-users add ${key} failed: ${res.stderr || res.stdout}`);
    }
  }
}

async function userIds(admin: Admin, run: number): Promise<Record<GolfaarPlayerKey, string>> {
  const emails = KEYS.map((k) => emailOf(run, k));
  const rows = must(
    'users lookup',
    await admin.from('users').select('id, email').in('email', emails),
  );
  const ids = {} as Record<GolfaarPlayerKey, string>;
  for (const key of KEYS) {
    const row = rows.find((r) => r.email === emailOf(run, key));
    if (!row) throw new Error(`users lookup: no row for player ${key}`);
    ids[key] = row.id;
  }
  return ids;
}

async function main() {
  // Målet sjekkes før en klient finnes, og bare staging slipper gjennom.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const refusal = scriptTargetRefusal({ url, wantProd: false });
  if (refusal !== null) throw new Error(refusal);
  if (supabaseTargetOf(url) !== 'staging') {
    throw new Error(`kavalkade-generalproeve skriver bare til staging, ikke ${supabaseTargetOf(url)}.`);
  }
  const run = runNumber();
  console.log(`[generalproeve] run ${run} → staging (${new URL(url ?? '').host})`);

  const admin = getAdminClient();

  createUsers(run);
  const ids = await userIds(admin, run);
  const idOf = (key: GolfaarPlayerKey) => ids[key];

  // En kjøring som alt har spill, nektes: fasiten gjelder en gjeng uten andre runder.
  const already = must(
    'run check',
    await admin.from('game_players').select('game_id').in('user_id', Object.values(ids)).limit(1),
  );
  if (already.length > 0) {
    throw new Error(`Run ${run} har alt spill. Kjør --run ${run + 1}.`);
  }

  // Samtykke til AI-tekster: ja for dem fasiten sier, ingen rad for resten.
  const consenting = KEYS.filter((k) => GOLFAAR_PLAYERS[k].aiConsent);
  must(
    'ai_consents',
    await admin
      .from('ai_consents')
      .upsert(consenting.map((k) => ({ user_id: idOf(k), granted: true })), { onConflict: 'user_id' })
      .select('user_id'),
  );

  const creator = idOf('A');
  const course = must(
    'courses',
    await admin.from('courses').insert({ name: GOLFAAR_COURSE.name, created_by: creator }).select('id').single(),
  );
  const holeRows = must(
    'course_holes',
    await admin
      .from('course_holes')
      .insert(
        GOLFAAR_COURSE.holes.map((h) => ({
          course_id: course.id,
          hole_number: h.hole,
          par_mens: h.par,
          par_ladies: h.par,
          par_juniors: h.par,
          stroke_index: h.strokeIndex,
        })),
      )
      .select('hole_number'),
  );
  if (holeRows.length !== 18) throw new Error(`course_holes: wrote ${holeRows.length} of 18`);
  const tee = must(
    'tee_boxes',
    await admin
      .from('tee_boxes')
      .insert({
        course_id: course.id,
        name: GOLFAAR_COURSE.tee.name,
        slope_mens: GOLFAAR_COURSE.tee.slope,
        course_rating_mens: GOLFAAR_COURSE.tee.courseRating,
        par_total_mens: GOLFAAR_COURSE.tee.par,
      })
      .select('id')
      .single(),
  );

  const league = must(
    'leagues',
    await admin
      .from('leagues')
      .insert({
        name: `Generalprøveligaen r${run}`,
        season_start: '2026-04-01',
        season_end: '2026-10-31',
        format: 'stroke',
        scoring: 'net',
        standings_model: 'total',
        course_scope: 'single_course_single_tee',
        course_id: course.id,
        tee_box_id: tee.id,
        status: 'active',
        created_by: creator,
      })
      .select('id')
      .single(),
  );
  const leagueRound = must(
    'league_rounds',
    await admin
      .from('league_rounds')
      .insert({
        league_id: league.id,
        sequence: 1,
        label: 'Runde 1',
        opens_at: '2026-08-01T00:00:00.000Z',
        closes_at: '2026-08-31T21:59:00.000Z',
        original_closes_at: '2026-08-31T21:59:00.000Z',
      })
      .select('id')
      .single(),
  );
  const flightKeys = [
    ...new Set(GOLFAAR_GAMES.filter((g) => g.leagueFlight).flatMap((g) => g.players.map((p) => p.key))),
  ];
  must(
    'league_players',
    await admin
      .from('league_players')
      .insert(flightKeys.map((k) => ({ league_id: league.id, user_id: idOf(k) })))
      .select('user_id'),
  );

  const gameIds: Record<string, string> = {};
  const mismatches: string[] = [];
  for (const game of GOLFAAR_GAMES) {
    const row = must(
      `games ${game.key}`,
      await admin
        .from('games')
        .insert({
          name: game.name,
          status: 'finished',
          game_mode: game.gameMode,
          mode_config: game.modeConfig as never,
          course_id: course.id,
          tee_box_id: tee.id,
          created_by: creator,
          scheduled_tee_off_at: game.teeOffAt,
          started_at: game.teeOffAt,
          ended_at: game.endedAt,
          finish_pipeline_at: game.endedAt,
          hole_segment: 'full',
          league_round_id: game.leagueFlight ? leagueRound.id : null,
        })
        .select('id')
        .single(),
    );
    gameIds[game.key] = row.id;

    const players = must(
      `game_players ${game.key}`,
      await admin
        .from('game_players')
        .insert(
          game.players.map((p) => ({
            game_id: row.id,
            user_id: idOf(p.key),
            team_number: p.team ?? null,
            flight_number: p.team ?? null,
            course_handicap: 0,
            raw_course_handicap: 0,
            full_course_handicap: 0,
            tee_gender: 'mens' as const,
            accepted_at: game.teeOffAt,
            submitted_at: game.endedAt,
            approved_at: game.endedAt,
          })),
        )
        .select('user_id'),
    );
    if (players.length !== game.players.length) {
      throw new Error(`game_players ${game.key}: wrote ${players.length} of ${game.players.length}`);
    }

    const scores = game.players.flatMap((p) =>
      golfaarStrokesOf(game, p.key, idOf).map((s) => ({
        game_id: row.id,
        user_id: idOf(p.key),
        hole_number: s.hole,
        strokes: s.strokes,
        entered_by: idOf(p.key),
        client_updated_at: game.endedAt,
      })),
    );
    const written = must(`scores ${game.key}`, await admin.from('scores').insert(scores).select('id'));
    if (written.length !== scores.length) {
      throw new Error(`scores ${game.key}: wrote ${written.length} of ${scores.length}`);
    }

    await persistResultSummaries({
      id: row.id,
      game_mode: game.gameMode,
      mode_config: game.modeConfig,
      course_id: course.id,
      hole_segment: 'full',
    });

    // Les tilbake: en 0-rads skriving gir ingen feil (felle 2).
    const stored = must(
      `result_summary ${game.key}`,
      await admin.from('game_players').select('user_id, result_summary').eq('game_id', row.id),
    );
    for (const p of game.players) {
      const got = stored.find((s) => s.user_id === idOf(p.key))?.result_summary ?? null;
      const want = game.expected[p.key] ?? null;
      if (canonical(got) !== canonical(want)) {
        mismatches.push(`${game.key} ${p.key}: stored ${canonical(got)}, fasit ${canonical(want)}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        run,
        users: ids,
        aiConsent: consenting,
        course: course.id,
        teeBox: tee.id,
        league: league.id,
        leagueRound: leagueRound.id,
        games: gameIds,
        resultSummariesMatchFasit: mismatches.length === 0,
        mismatches,
      },
      null,
      2,
    ),
  );
  if (mismatches.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[generalproeve] fatal', err);
  process.exitCode = 1;
});
