#!/usr/bin/env node
/**
 * Clone a production cup into torny-staging so the finish flow can be
 * rehearsed against real data before the ceremony.
 *
 *   node scripts/clone-cup-to-staging.mjs [tournamentId]
 *
 * Reads prod strictly read-only (SELECT via service-role REST) and rewrites the
 * whole object graph into staging under the SAME uuids, so every id in the URL
 * bar matches prod. Re-runnable: the staging copy is deleted and rebuilt on each
 * run, so you get a fresh snapshot whenever prod moves on.
 *
 * Two deliberate deviations from a byte-for-byte copy:
 *  - e-mail addresses are replaced with `@example.invalid` so no notification
 *    can ever reach a real player from the rehearsal, and
 *  - friend codes are re-derived from the uuid so they cannot collide with
 *    codes already in staging.
 * Everything the finish flow reads — scores, handicaps, submissions, side
 * awards, allowances, team split — is copied verbatim.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const TOURNAMENT_ID = process.argv[2] ?? '7fb3caab-1b01-4247-9dbc-4f26d67d1c81';

const PROD_ENV = '.env.local';
const STAGING_ENV = '.env.staging.local';

/** Minimal dotenv reader — we only need three keys per file. */
function loadEnv(file) {
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), file), 'utf8');
  } catch {
    throw new Error(`Fant ikke ${file} i ${process.cwd()} — kjør scriptet fra rota av worktreet.`);
  }
  const out = {};
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function client(env, label) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`${label}: mangler NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Throws on any PostgREST error so a partial clone can never look like success. */
function ok(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.message}${error.details ? ` — ${error.details}` : ''}`);
  return data ?? [];
}

const chunks = (rows, size = 500) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

const uniq = (values) => [...new Set(values.filter(Boolean))];

async function main() {
  const prodEnv = loadEnv(PROD_ENV);
  const stagingEnv = loadEnv(STAGING_ENV);

  const prod = client(prodEnv, PROD_ENV);
  const staging = client(stagingEnv, STAGING_ENV);

  if (prodEnv.NEXT_PUBLIC_SUPABASE_URL === stagingEnv.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Prod- og staging-URL er identiske — avbryter før noe skrives.');
  }
  console.log(`Kilde (les):  ${prodEnv.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Mål (skriv):  ${stagingEnv.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Cup:          ${TOURNAMENT_ID}\n`);

  // ---------------------------------------------------------------- READ prod
  const [tournament] = ok(
    'les tournaments',
    await prod.from('tournaments').select('*').eq('id', TOURNAMENT_ID),
  );
  if (!tournament) throw new Error(`Fant ingen cup med id ${TOURNAMENT_ID} i prod.`);

  const participants = ok(
    'les tournament_participants',
    await prod.from('tournament_participants').select('*').eq('tournament_id', TOURNAMENT_ID),
  );
  const plans = ok(
    'les tournament_plans',
    await prod.from('tournament_plans').select('*').eq('tournament_id', TOURNAMENT_ID),
  );
  const sideAwards = ok(
    'les tournament_side_awards',
    await prod.from('tournament_side_awards').select('*').eq('tournament_id', TOURNAMENT_ID),
  );
  const games = ok(
    'les games',
    await prod.from('games').select('*').eq('tournament_id', TOURNAMENT_ID),
  );
  const gameIds = games.map((g) => g.id);

  const gamePlayers = gameIds.length
    ? ok('les game_players', await prod.from('game_players').select('*').in('game_id', gameIds))
    : [];
  const scores = gameIds.length
    ? ok('les scores', await prod.from('scores').select('*').in('game_id', gameIds))
    : [];
  const sideWinners = gameIds.length
    ? ok('les game_side_winners', await prod.from('game_side_winners').select('*').in('game_id', gameIds))
    : [];

  const courseIds = uniq([...games.map((g) => g.course_id), ...plans.map((p) => p.course_id)]);
  const courses = courseIds.length
    ? ok('les courses', await prod.from('courses').select('*').in('id', courseIds))
    : [];
  const teeBoxes = courseIds.length
    ? ok('les tee_boxes', await prod.from('tee_boxes').select('*').in('course_id', courseIds))
    : [];
  const courseHoles = courseIds.length
    ? ok('les course_holes', await prod.from('course_holes').select('*').in('course_id', courseIds))
    : [];

  // Every user id the copied rows point at — participants plus whoever created
  // the cup, the games and the course, entered scores or decided side awards.
  const userIds = uniq([
    tournament.created_by,
    ...participants.map((p) => p.user_id),
    ...games.flatMap((g) => [
      g.created_by,
      g.foursomes_side1_tee_starter_user_id,
      g.foursomes_side2_tee_starter_user_id,
    ]),
    ...gamePlayers.flatMap((p) => [p.user_id, p.approved_by_user_id, p.withdrawn_by_user_id]),
    ...scores.flatMap((s) => [s.user_id, s.entered_by]),
    ...sideAwards.map((a) => a.winner_user_id),
    ...sideWinners.map((w) => w.winner_user_id),
    ...courses.flatMap((c) => [c.created_by, c.updated_by]),
  ]);
  const users = ok('les users', await prod.from('users').select('*').in('id', userIds));

  // Anonymise before anything is written or logged. Deterministic, so re-runs
  // land on the same addresses and the auth accounts stay reusable.
  const anonymised = users.map((u) => ({
    ...u,
    email: `cup-${u.id.slice(0, 8)}@example.invalid`,
    friend_code: u.id.replace(/-/g, '').slice(0, 8).toLowerCase(),
  }));

  console.log('Hentet fra prod:');
  console.log(`  ${users.length} brukere · ${games.length} kamper · ${gamePlayers.length} kampdeltakere`);
  console.log(`  ${scores.length} scores · ${sideAwards.length} sidepoeng · ${courses.length} bane(r)\n`);

  // ------------------------------------------------------------ WIPE staging
  // Reverse dependency order. Only rows belonging to this cup are touched.
  if (gameIds.length) {
    ok('slett scores', await staging.from('scores').delete().in('game_id', gameIds));
    ok('slett game_side_winners', await staging.from('game_side_winners').delete().in('game_id', gameIds));
    ok('slett game_players', await staging.from('game_players').delete().in('game_id', gameIds));
    ok('slett games', await staging.from('games').delete().in('id', gameIds));
  }
  ok('slett side awards', await staging.from('tournament_side_awards').delete().eq('tournament_id', TOURNAMENT_ID));
  ok('slett plans', await staging.from('tournament_plans').delete().eq('tournament_id', TOURNAMENT_ID));
  ok('slett participants', await staging.from('tournament_participants').delete().eq('tournament_id', TOURNAMENT_ID));
  ok('slett tournament', await staging.from('tournaments').delete().eq('id', TOURNAMENT_ID));
  // Varsler fra forrige generalprøve — ellers ligger gamle «cupen er avsluttet»
  // i innboksen og forstyrrer neste runde.
  ok('slett varsler', await staging.from('notifications').delete().in('user_id', userIds));

  // --------------------------------------------------- CREATE staging logins
  // public.users has no FK to auth.users, but an auth row is what makes a
  // player loggable-in on staging. Cheap enough to give all of them one.
  let created = 0;
  for (const u of anonymised) {
    const { error } = await staging.auth.admin.createUser({
      id: u.id,
      email: u.email,
      email_confirm: true,
    });
    if (!error) {
      created += 1;
      continue;
    }
    if (!/already|registered|exists|duplicate/i.test(error.message)) {
      throw new Error(`opprett auth-bruker ${u.email}: ${error.message}`);
    }
  }
  console.log(`Innloggingskontoer: ${created} nye, ${anonymised.length - created} fantes fra før.`);

  // -------------------------------------------------------- WRITE staging
  ok('skriv users', await staging.from('users').upsert(anonymised, { onConflict: 'id' }));
  if (courses.length) ok('skriv courses', await staging.from('courses').upsert(courses, { onConflict: 'id' }));
  if (teeBoxes.length) ok('skriv tee_boxes', await staging.from('tee_boxes').upsert(teeBoxes, { onConflict: 'id' }));
  if (courseHoles.length) {
    ok(
      'skriv course_holes',
      await staging.from('course_holes').upsert(courseHoles, { onConflict: 'course_id,hole_number' }),
    );
  }

  ok('skriv tournament', await staging.from('tournaments').insert(tournament));
  if (participants.length) ok('skriv participants', await staging.from('tournament_participants').insert(participants));
  if (plans.length) ok('skriv plans', await staging.from('tournament_plans').insert(plans));
  if (sideAwards.length) ok('skriv side awards', await staging.from('tournament_side_awards').insert(sideAwards));

  // games.source_game_id points at another game in the same batch — insert the
  // rows without the self-reference, then wire it up.
  if (games.length) {
    ok('skriv games', await staging.from('games').insert(games.map((g) => ({ ...g, source_game_id: null }))));
    for (const g of games.filter((g) => g.source_game_id)) {
      ok(
        `koble avledet kamp ${g.tournament_match_label ?? g.id}`,
        await staging.from('games').update({ source_game_id: g.source_game_id }).eq('id', g.id).select('id'),
      );
    }
  }
  for (const batch of chunks(gamePlayers)) {
    ok('skriv game_players', await staging.from('game_players').insert(batch));
  }
  for (const batch of chunks(scores)) {
    ok('skriv scores', await staging.from('scores').insert(batch));
  }
  if (sideWinners.length) ok('skriv game_side_winners', await staging.from('game_side_winners').insert(sideWinners));

  // ------------------------------------------------------------- VERIFY copy
  const count = async (table, column, value) => {
    const { count: n, error } = await staging
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, value);
    if (error) throw new Error(`tell ${table}: ${error.message}`);
    return n ?? 0;
  };
  const scoreCount = gameIds.length
    ? (await staging.from('scores').select('*', { count: 'exact', head: true }).in('game_id', gameIds)).count ?? 0
    : 0;
  const playerCount = gameIds.length
    ? (await staging.from('game_players').select('*', { count: 'exact', head: true }).in('game_id', gameIds)).count ?? 0
    : 0;

  const actual = {
    games: await count('games', 'tournament_id', TOURNAMENT_ID),
    participants: await count('tournament_participants', 'tournament_id', TOURNAMENT_ID),
    side_awards: await count('tournament_side_awards', 'tournament_id', TOURNAMENT_ID),
    game_players: playerCount,
    scores: scoreCount,
  };
  const expected = {
    games: games.length,
    participants: participants.length,
    side_awards: sideAwards.length,
    game_players: gamePlayers.length,
    scores: scores.length,
  };
  const mismatches = Object.keys(expected).filter((k) => expected[k] !== actual[k]);
  if (mismatches.length) {
    throw new Error(
      `Kopien stemmer ikke: ${mismatches.map((k) => `${k} ${actual[k]}/${expected[k]}`).join(', ')}`,
    );
  }

  const organiser = anonymised.find((u) => u.id === tournament.created_by);
  console.log('\nKopien er verifisert mot prod:');
  for (const key of Object.keys(expected)) console.log(`  ${key}: ${actual[key]}`);
  console.log(`\nArrangør (den som skal trykke «Avslutt»): ${organiser?.name ?? '?'} — ${organiser?.email}`);
  console.log(`Cup-side:   /admin/cup/${TOURNAMENT_ID}`);
  console.log(`Resultater: /cup/${TOURNAMENT_ID}/resultater`);
}

main().catch((err) => {
  console.error(`\nAVBRUTT: ${err.message}`);
  process.exit(1);
});
