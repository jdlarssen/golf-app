#!/usr/bin/env node
/**
 * Provisjonerer App Store-review-kontoen (#1284) med demo-data, så Apple sin
 * reviewer ser kjernen i appen uten å sette opp noe selv.
 *
 *   REVIEW_ACCOUNT_EMAIL=… REVIEW_ACCOUNT_PASSWORD=… \
 *     node scripts/provision-review-account.mjs [--env staging|prod]
 *
 * Default er staging. `--env prod` må skrives eksplisitt, og skriptet printer
 * hvilken Supabase-URL det skriver til FØR første skriv.
 *
 * Kontoen og passordet ligger ALDRI i repoet: begge leses fra prosess-env, og
 * passordet skrives aldri til logg. Se docs/native/app-store-review-konto.md.
 *
 * Idempotent — kjør så mange ganger du vil. Andre kjøring finner alt som
 * finnes, roterer passordet og resetter demo-spillet til kjent tilstand
 * («frisk demo før hver innsending»).
 *
 * Kjøringen tåler også at revieweren har SLETTET kontoen sin — det skal gå an
 * (App Store 5.1.1(v), #1909). Derfor er det ADMIN-kontoen som står som
 * arrangør av demo-runden, ikke review-kontoen: runden overlever slettingen,
 * og en ny kjøring lager kontoen på nytt, rydder bort den anonymiserte raden i
 * rosteret og seeder demoen om igjen. Finnes det flere (eller ingen)
 * admin-kontoer, må REVIEW_DEMO_ORGANIZER_EMAIL peke ut arrangøren.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PROD_ENV = '.env.local';
const STAGING_ENV = '.env.staging.local';

/** Gjenkjennbart navn så gjenkjøringer finner spillet igjen. Engelsk — revieweren leser det. */
const DEMO_GAME_NAME = 'Demo Round — Tørny';

/** Formatet demo-runden spilles i. Speiles av `DEMO_MODE_CONFIG`. */
const DEMO_GAME_MODE = 'stableford';

/**
 * Formatoppsettet for demo-runden (#1976).
 *
 * Skriptet skrev tidligere `{}` her. Kolonnen er `not null default '{}'::jsonb`,
 * så det så uskyldig ut — og nettsiden viste da også en helt vanlig
 * stableford-tavle, fordi motoren ruter på `games.game_mode`. Appen krevde
 * derimot `mode_config.kind`, og ga blindveien «Formatet er ikke satt opp for
 * denne runden.» uten vei videre. Nøyaktig den runden er den Apples anmelder
 * blir bedt om å åpne.
 *
 * Appen faller nå tilbake på `game_mode` som webben gjør, men den ekte
 * configen skal uansett stå: en demo-rad skal se ut som en rad veiviseren
 * ville laget. Formen er hentet fra `GameModeConfig` i
 * `lib/scoring/modes/types.ts` og fra ekte rader i prod.
 */
const DEMO_MODE_CONFIG = { kind: DEMO_GAME_MODE, team_size: 1, points_table: 'standard' };
// Fornavnet brukes i hilsener («Hi, Alex.») — må lese som et ekte navn.
const REVIEW_USER_NAME = 'Alex Reviewer';
const REVIEW_HCP_INDEX = 18;
const REVIEW_COURSE_HANDICAP = 18;

/** Gjeste-medspillere. Samme plassholder-domene som lib/games/createGuestPlayer.ts. */
const GUEST_EMAIL_DOMAIN = 'guest.tornygolf.no';
const CO_PLAYERS = [
  { name: 'Emma', hcpIndex: 8.4, courseHandicap: 10 },
  { name: 'Jonas', hcpIndex: 20.1, courseHandicap: 22 },
  { name: 'Nora', hcpIndex: 6.7, courseHandicap: 8 },
];

/**
 * Demo-tilstanden revieweren møter: medspillerne har spilt hull 1–6, kontoen
 * selv hull 1–3. Da står «fortsett på hull 4» klart, og leaderboardet har
 * ekte tall i seg. Tallene er avvik fra par per hull — par + offset gir slag.
 */
const SCORE_OFFSETS = {
  review: [0, 1, -1],
  Emma: [0, 1, 0, 2, 0, -1],
  Jonas: [1, 0, 2, 1, 0, 1],
  Nora: [0, -1, 1, 0, 1, 2],
};

/** Minimal dotenv-leser — vi trenger bare URL + service-role-nøkkelen. */
function loadEnv(file) {
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), file), 'utf8');
  } catch {
    throw new Error(
      `Fant ikke ${file} i ${process.cwd()} — kjør skriptet fra rota av worktreet.`,
    );
  }
  const out = {};
  for (const line of raw.split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
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
  if (!url || !key) {
    throw new Error(
      `${label}: mangler NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Kaster på enhver PostgREST-feil, så en halv provisjonering aldri ser ut som suksess. */
function ok(label, { data, error }) {
  if (error) {
    throw new Error(
      `${label}: ${error.message}${error.details ? ` — ${error.details}` : ''}`,
    );
  }
  return data ?? [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

/**
 * Poll på `public.users`-raden triggeren `on_auth_user_created` lager. Samme
 * 5 × 200 ms som `createGuestUser` (lib/games/createGuestPlayer.ts) — raden
 * finnes normalt umiddelbart, pollingen absorberer replikerings-lag.
 */
async function waitForUsersRow(db, userId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = ok(
      'les users',
      await db.from('users').select('id').eq('id', userId),
    );
    if (rows.length > 0) return true;
    await sleep(200);
  }
  return false;
}

/**
 * Oppdater `public.users` og BEKREFT at én rad ble truffet. PostgREST svarer
 * `error == null` på en update som ikke traff noe (AGENTS.md trap 2), så
 * `.select('id')` + radtelling er det eneste ekte suksess-signalet.
 */
async function updateUserRow(db, userId, patch, label) {
  const rows = ok(label, await db.from('users').update(patch).eq('id', userId).select('id'));
  if (rows.length !== 1) {
    throw new Error(`${label}: traff ${rows.length} rader, forventet 1`);
  }
}

/** Finn auth-brukeren for adressen. `public.users` først, så GoTrue-paging. */
async function findAuthUserId(db, email) {
  // `ilike` tolker `%` og `_` som jokertegn, og begge er lovlige i en e-post
  // (`a_b@x.no` ville matchet `aXb@x.no`). Vi henter derfor kandidatene og
  // filtrerer på eksakt likhet i JS, slik `resolveOrganizer` gjør — treffet her
  // får skrevet navn, hcp og `deleted_at: null`, så feil bruker er dyrt.
  const rows = ok(
    'slå opp users på e-post',
    await db.from('users').select('id, email').ilike('email', email).limit(20),
  );
  const exact = rows.filter(
    (r) => (r.email ?? '').toLowerCase() === email.toLowerCase(),
  );
  if (exact.length > 0) return exact[0].id;

  // Fallback: auth-raden kan finnes uten users-rad (avbrutt tidligere kjøring).
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find(
      (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
    );
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}

/** Opprett en gjeste-medspiller: auth-bruker → users-rad → profilfelt. */
async function createGuest(db, profile) {
  const placeholderEmail = `gjest+${crypto.randomUUID()}@${GUEST_EMAIL_DOMAIN}`;
  const { data, error } = await db.auth.admin.createUser({
    email: placeholderEmail,
    email_confirm: true,
  });
  if (error || !data?.user) {
    throw new Error(`createUser (gjest ${profile.name}): ${error?.message ?? 'ingen bruker'}`);
  }
  const userId = data.user.id;

  if (!(await waitForUsersRow(db, userId))) {
    throw new Error(`users-raden for gjest ${profile.name} dukket aldri opp`);
  }
  const stamp = nowIso();
  await updateUserRow(
    db,
    userId,
    {
      name: profile.name,
      hcp_index: profile.hcpIndex,
      handicap_updated_at: stamp,
      profile_completed_at: stamp,
      gender: 'mens',
      level: 'normal',
      is_guest: true,
    },
    `oppdater gjesteprofil ${profile.name}`,
  );
  return userId;
}

/**
 * Finn arrangøren for demo-runden: admin-kontoen, ikke review-kontoen.
 *
 * Hvorfor det er sånn: revieweren skal kunne slette kontoen sin, og sperren i
 * `lib/users/deleteAccount.ts` stopper den som arrangerer noe som ikke er
 * avsluttet. Eide review-kontoen demo-runden, ville sperren vært permanent —
 * nøyaktig omveien Apple avviser. Som deltaker slipper revieweren alltid
 * gjennom, og runden blir stående når kontoen forsvinner.
 *
 * Nøyaktig én admin → den brukes. Ingen eller flere → skriptet nekter å gjette,
 * og REVIEW_DEMO_ORGANIZER_EMAIL må si hvem det er. Er env-varen satt, vinner
 * den uansett: en adresse noen har skrevet inn skal aldri bli stille ignorert.
 */
async function resolveOrganizer(db) {
  const override = (process.env.REVIEW_DEMO_ORGANIZER_EMAIL ?? '').trim().toLowerCase();
  if (override) {
    // `ilike` fanger store/små bokstaver, men behandler `%` og `_` som
    // jokertegn — og `_` er lovlig i en e-postadresse. Derfor filtreres treffene
    // på eksakt likhet etterpå: aldri feil arrangør på grunn av et mønster.
    const candidates = ok(
      'slå opp arrangør på e-post',
      await db.from('users').select('id, name, email').ilike('email', override).limit(10),
    );
    const rows = candidates.filter((u) => (u.email ?? '').toLowerCase() === override);
    if (rows.length === 0) {
      throw new Error(
        `REVIEW_DEMO_ORGANIZER_EMAIL peker på «${override}», men ingen bruker i dette miljøet har den adressen.`,
      );
    }
    if (rows.length > 1) {
      throw new Error(
        `REVIEW_DEMO_ORGANIZER_EMAIL «${override}» treffer ${rows.length} brukere — adressen må være entydig.`,
      );
    }
    return { ...rows[0], source: 'REVIEW_DEMO_ORGANIZER_EMAIL' };
  }

  const admins = ok(
    'slå opp admin-kontoer',
    await db.from('users').select('id, name, email').eq('is_admin', true),
  );
  if (admins.length === 1) {
    return { ...admins[0], source: 'users.is_admin' };
  }

  const why =
    admins.length === 0
      ? 'Fant ingen admin-konto (users.is_admin = true) som kan stå som arrangør for demo-runden.'
      : `Fant ${admins.length} admin-kontoer — skriptet gjetter ikke på hvem som skal arrangere demo-runden.`;
  throw new Error(
    `${why}\n` +
      '  Sett REVIEW_DEMO_ORGANIZER_EMAIL til e-postadressen til den som skal stå som\n' +
      '  arrangør, og kjør på nytt:\n' +
      '    REVIEW_DEMO_ORGANIZER_EMAIL=… REVIEW_ACCOUNT_EMAIL=… REVIEW_ACCOUNT_PASSWORD=… \\\n' +
      '      node scripts/provision-review-account.mjs',
  );
}

async function main() {
  // ------------------------------------------------------------- argumenter
  const args = process.argv.slice(2);
  let target = 'staging';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env') {
      target = args[i + 1];
      i++;
    } else if (args[i].startsWith('--env=')) {
      target = args[i].slice('--env='.length);
    } else {
      throw new Error(`Ukjent argument: ${args[i]} (bruk --env staging|prod)`);
    }
  }
  if (target !== 'staging' && target !== 'prod') {
    throw new Error(`--env må være staging eller prod (fikk «${target ?? ''}»)`);
  }

  const email = (process.env.REVIEW_ACCOUNT_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.REVIEW_ACCOUNT_PASSWORD ?? '';
  if (!email || !password) {
    throw new Error(
      'REVIEW_ACCOUNT_EMAIL og REVIEW_ACCOUNT_PASSWORD må settes i miljøet.\n' +
        '  REVIEW_ACCOUNT_EMAIL=… REVIEW_ACCOUNT_PASSWORD=… node scripts/provision-review-account.mjs',
    );
  }
  if (password.length < 24) {
    console.warn(
      `⚠️  Passordet er ${password.length} tegn. Runbooken ber om minst 24 — denne kontoen er den ene som kan angripes utenfra.`,
    );
  }

  const envFile = target === 'prod' ? PROD_ENV : STAGING_ENV;
  const env = loadEnv(envFile);
  const db = client(env, envFile);

  // Prod-vakt: staging-kjøring som peker på prod-URL-en er en feilkonfigurert
  // .env.staging.local — stopp FØR noe skrives.
  if (target === 'staging') {
    let prodUrl = null;
    try {
      prodUrl = loadEnv(PROD_ENV).NEXT_PUBLIC_SUPABASE_URL ?? null;
    } catch {
      // Ingen .env.local her — ingenting å sammenligne mot.
    }
    if (prodUrl && prodUrl === env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error(
        `${STAGING_ENV} peker på SAMME Supabase-prosjekt som ${PROD_ENV} — avbryter før skriving.`,
      );
    }
  }

  console.log(`Miljø:        ${target}  (${envFile})`);
  console.log(`Skriver til:  ${env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Konto:        ${email}`);

  // Arrangøren løses FØR første skriv — mangler den, skal ingenting være
  // halvveis gjort når skriptet stopper.
  const organizer = await resolveOrganizer(db);
  const organizerLabel = `${organizer.name ?? '(uten navn)'} <${organizer.email}>`;
  console.log(`Arrangør:     ${organizerLabel}  [${organizer.source}]`);
  if (target === 'prod') {
    console.log('⚠️  PRODUKSJON — dette skriver til den ekte databasen.');
  }
  console.log('');

  // ------------------------------------------------------- 1. auth-brukeren
  let reviewUserId = await findAuthUserId(db, email);
  let created = false;
  if (reviewUserId) {
    const { error } = await db.auth.admin.updateUserById(reviewUserId, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUserById: ${error.message}`);
    console.log('1. Auth-bruker fantes — passordet er rotert.');
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data?.user) {
      throw new Error(`createUser: ${error?.message ?? 'ingen bruker'}`);
    }
    reviewUserId = data.user.id;
    created = true;
    console.log('1. Auth-bruker opprettet.');
  }

  // ---------------------------------------------------------- 2. profilrad
  if (!(await waitForUsersRow(db, reviewUserId))) {
    throw new Error('users-raden for review-kontoen dukket aldri opp');
  }
  const stamp = nowIso();
  await updateUserRow(
    db,
    reviewUserId,
    {
      name: REVIEW_USER_NAME,
      hcp_index: REVIEW_HCP_INDEX,
      handicap_updated_at: stamp,
      profile_completed_at: stamp,
      gender: 'mens',
      level: 'normal',
      // Engelsk UI: revieweren leser ikke norsk.
      locale: 'en',
      is_guest: false,
      // Nulles fordi en tidligere reviewer kan ha rukket å slette seg. Det kan
      // bare treffe raden vi nettopp har identifisert SOM review-kontoen: en
      // fullført sletting obfuskerer adressen i både public.users (scrubben i
      // anonymize_user) og GoTrue (soft delete), så oppslaget over finner
      // ingenting og vi havner i createUser-grenen med en fersk rad i stedet.
      deleted_at: null,
    },
    'oppdater review-profil',
  );
  console.log(`2. Profil satt (${REVIEW_USER_NAME}, hcp ${REVIEW_HCP_INDEX}, locale en).`);

  // -------------------------------------------------------- 3. demo-spillet
  // Oppslag på NAVN, ikke på creator: arrangøren kan ha blitt flyttet (og et
  // spill fra før #1909 står fortsatt på review-kontoen). Nyeste vinner.
  const existingGames = ok(
    'les games',
    await db
      .from('games')
      .select('id, short_id, course_id, tee_box_id, created_by, game_mode, mode_config')
      .eq('name', DEMO_GAME_NAME)
      .order('created_at', { ascending: false })
      .limit(1),
  );

  let game = existingGames[0] ?? null;
  if (game) {
    // Eierskapsgard. Uten creator-filteret i oppslaget over er navnet det
    // eneste som peker ut spillet, og «Demo Round — Tørny» er ikke reservert:
    // en ekte bruker kan kalle runden sin det samme. Steg 4-5 under sletter
    // alle scores og feier rosteret, så et feiltreff er uopprettelig. Vi
    // godtar derfor bare et spill som ALT tilhører review-kontoen eller
    // arrangøren — alt annet stopper med en melding som ber om opprydding for
    // hånd, i stedet for å skrive blindt.
    if (
      game.created_by !== organizer.id &&
      game.created_by !== reviewUserId
    ) {
      throw new Error(
        `Fant et spill som heter «${DEMO_GAME_NAME}» (${game.id}), men det eies ` +
          `verken av review-kontoen eller arrangøren. Skriptet rører det ikke — ` +
          `det ville slettet scorene og rosteret til noen andre. Sjekk spillet i ` +
          `databasen og rydd opp for hånd, eller gi demo-spillet et annet navn.`,
      );
    }
    console.log(`3. Demo-spillet fantes (${game.id}).`);
    if (game.created_by !== organizer.id) {
      // PostgREST svarer error == null på en update som ikke traff noe
      // (AGENTS.md trap 2) — radtellingen er det eneste ekte suksess-signalet.
      const reparented = ok(
        'flytt demo-spillet til arrangøren',
        await db
          .from('games')
          .update({ created_by: organizer.id })
          .eq('id', game.id)
          .select('id'),
      );
      if (reparented.length !== 1) {
        throw new Error(
          `flytt demo-spillet til arrangøren: traff ${reparented.length} rader, forventet 1`,
        );
      }
      game.created_by = organizer.id;
      console.log(`   Arrangør flyttet til ${organizerLabel}.`);
    }

    // Formatoppsettet repareres på gjenkjøring (#1976). Runden i prod ble
    // opprettet med `mode_config: {}` av en eldre versjon av dette skriptet,
    // og reuse-grenen ville ellers latt den stå slik for alltid — «reset før
    // hver innsending» må også rette det som var galt fra før.
    const configIsCanonical =
      game.game_mode === DEMO_GAME_MODE &&
      JSON.stringify(game.mode_config ?? null) === JSON.stringify(DEMO_MODE_CONFIG);
    if (!configIsCanonical) {
      const repaired = ok(
        'reparer demo-spillets formatoppsett',
        await db
          .from('games')
          .update({ game_mode: DEMO_GAME_MODE, mode_config: DEMO_MODE_CONFIG })
          .eq('id', game.id)
          .select('id'),
      );
      if (repaired.length !== 1) {
        throw new Error(
          `reparer demo-spillets formatoppsett: traff ${repaired.length} rader, forventet 1`,
        );
      }
      console.log(
        `   Formatoppsett satt: ${DEMO_GAME_MODE} ${JSON.stringify(DEMO_MODE_CONFIG)} ` +
          `(var ${game.game_mode} ${JSON.stringify(game.mode_config)}).`,
      );
      game.game_mode = DEMO_GAME_MODE;
      game.mode_config = DEMO_MODE_CONFIG;
    }
  } else {
    const tees = ok(
      'les tee_boxes',
      await db
        .from('tee_boxes')
        .select('id, course_id')
        .not('par_total_mens', 'is', null)
        .is('archived_at', null)
        .limit(20),
    );
    // Velg første tee hvis bane har hull registrert — uten course_holes får
    // demo-runden ingen par å regne mot.
    let picked = null;
    for (const tee of tees) {
      const holes = ok(
        'les course_holes',
        await db
          .from('course_holes')
          .select('hole_number')
          .eq('course_id', tee.course_id)
          .limit(1),
      );
      if (holes.length > 0) {
        picked = tee;
        break;
      }
    }
    if (!picked) throw new Error('Fant ingen tee_box med herre-rating og registrerte hull');

    const inserted = ok(
      'opprett demo-spill',
      await db
        .from('games')
        .insert({
          name: DEMO_GAME_NAME,
          course_id: picked.course_id,
          tee_box_id: picked.id,
          game_mode: DEMO_GAME_MODE,
          mode_config: DEMO_MODE_CONFIG,
          registration_mode: 'invite_only',
          registration_type: 'solo',
          status: 'active',
          created_by: organizer.id,
        })
        .select('id, short_id, course_id, tee_box_id, created_by'),
    );
    if (inserted.length !== 1) throw new Error('Insert av demo-spill traff 0 rader');
    game = inserted[0];
    console.log(`3. Demo-spill opprettet (${game.id}).`);
  }

  // ------------------------------------------------------- 4. medspillerne
  // Scorene ryddes her, før roster-radene: en rad som skal bort kan ha scores,
  // og hele settet seedes uansett på nytt i steg 5.
  ok('slett scores', await db.from('scores').delete().eq('game_id', game.id));

  const roster = ok(
    'les game_players',
    await db.from('game_players').select('user_id').eq('game_id', game.id),
  );
  const rosterIds = roster.map((r) => r.user_id);
  const rosterNames = new Map();
  if (rosterIds.length > 0) {
    const users = ok(
      'les roster-profiler',
      await db.from('users').select('id, name').in('id', rosterIds),
    );
    for (const u of users) rosterNames.set(u.name, u.id);
  }

  // Rydd alt som ikke er review-kontoen eller en av de tre gjestene. Har en
  // reviewer slettet seg, står den gamle raden igjen som «Slettet bruker» — og
  // en kjøring fra før #1909 kan ha lagt arrangøren i rosteret. Begge ut.
  const keepIds = [reviewUserId];
  for (const profile of CO_PLAYERS) {
    const known = rosterNames.get(profile.name);
    if (known) keepIds.push(known);
  }
  const swept = ok(
    'rydd roster',
    await db
      .from('game_players')
      .delete()
      .eq('game_id', game.id)
      .not('user_id', 'in', `(${keepIds.join(',')})`)
      .select('user_id'),
  );
  if (swept.length > 0) {
    console.log(`   Fjernet ${swept.length} rad(er) som ikke hører hjemme i demo-rosteret.`);
  }

  const acceptedAt = nowIso();

  // Review-kontoens egen rad. `accepted_at` MÅ settes — uten den står kontoen
  // som «ikke bekreftet» og ser ikke ut som en ekte deltaker.
  if (rosterIds.includes(reviewUserId)) {
    ok(
      'oppdater review-roster',
      await db
        .from('game_players')
        .update({
          flight_number: 1,
          course_handicap: REVIEW_COURSE_HANDICAP,
          tee_gender: 'mens',
          accepted_at: acceptedAt,
        })
        .eq('game_id', game.id)
        .eq('user_id', reviewUserId)
        .select('user_id'),
    );
  } else {
    ok(
      'legg review-kontoen i roster',
      await db
        .from('game_players')
        .insert({
          game_id: game.id,
          user_id: reviewUserId,
          flight_number: 1,
          course_handicap: REVIEW_COURSE_HANDICAP,
          tee_gender: 'mens',
          accepted_at: acceptedAt,
        })
        .select('user_id'),
    );
  }

  const coPlayerIds = {};
  for (const profile of CO_PLAYERS) {
    const existingId = rosterNames.get(profile.name);
    if (existingId) {
      coPlayerIds[profile.name] = existingId;
      ok(
        `oppdater roster ${profile.name}`,
        await db
          .from('game_players')
          .update({
            flight_number: 1,
            course_handicap: profile.courseHandicap,
            tee_gender: 'mens',
            accepted_at: acceptedAt,
          })
          .eq('game_id', game.id)
          .eq('user_id', existingId)
          .select('user_id'),
      );
      continue;
    }
    const guestId = await createGuest(db, profile);
    coPlayerIds[profile.name] = guestId;
    const rows = ok(
      `legg ${profile.name} i roster`,
      await db
        .from('game_players')
        .insert({
          game_id: game.id,
          user_id: guestId,
          flight_number: 1,
          course_handicap: profile.courseHandicap,
          tee_gender: 'mens',
          accepted_at: acceptedAt,
        })
        .select('user_id'),
    );
    if (rows.length !== 1) throw new Error(`Roster-insert for ${profile.name} traff 0 rader`);
  }
  console.log(
    `4. Roster: review-kontoen (deltaker) + ${CO_PLAYERS.map((p) => p.name).join(', ')}.`,
  );

  // --------------------------------------------------- 5. scores + tilstand
  // Scorene ble tømt i steg 4; her legges utgangstilstanden inn igjen, uansett
  // hvor langt forrige reviewer rakk å spille.
  const holes = ok(
    'les course_holes',
    await db
      .from('course_holes')
      .select('hole_number, par_mens')
      .eq('course_id', game.course_id)
      .order('hole_number'),
  );
  const parByHole = new Map(holes.map((h) => [h.hole_number, h.par_mens]));

  const scoreRows = [];
  const stampScores = nowIso();
  const pushScores = (userId, offsets) => {
    offsets.forEach((offset, idx) => {
      const holeNumber = idx + 1;
      const par = parByHole.get(holeNumber);
      if (par == null) return;
      scoreRows.push({
        game_id: game.id,
        user_id: userId,
        hole_number: holeNumber,
        strokes: par + offset,
        // Alt er tastet av review-kontoen: gjestene har ingen innlogging, så
        // en flightkamerat fører slagene deres — som i ekte bruk.
        entered_by: reviewUserId,
        client_updated_at: stampScores,
      });
    });
  };
  pushScores(reviewUserId, SCORE_OFFSETS.review);
  for (const profile of CO_PLAYERS) {
    pushScores(coPlayerIds[profile.name], SCORE_OFFSETS[profile.name]);
  }
  if (scoreRows.length > 0) {
    ok('sett demo-scores', await db.from('scores').insert(scoreRows));
  }

  // Spillet tilbake til «pågår», og hver spiller tilbake til «ikke levert».
  ok(
    'reset game-status',
    await db
      .from('games')
      .update({
        status: 'active',
        started_at: stampScores,
        ended_at: null,
        round_report: null,
      })
      .eq('id', game.id)
      .select('id'),
  );
  ok(
    'reset leveringer',
    await db
      .from('game_players')
      .update({
        submitted_at: null,
        approved_at: null,
        approved_by_user_id: null,
        result_summary: null,
        score_differential: null,
        deliver_reminder_sent_at: null,
        withdrawn_at: null,
        withdrawn_by_user_id: null,
      })
      .eq('game_id', game.id)
      .select('user_id'),
  );

  const finalRoster = ok(
    'tell roster',
    await db.from('game_players').select('user_id').eq('game_id', game.id),
  );
  const finalScores = ok(
    'tell scores',
    await db.from('scores').select('id').eq('game_id', game.id),
  );

  console.log('5. Scores resatt, spillet står som pågående.\n');
  console.log(created ? '✅ Provisjonert.' : '✅ Allerede provisjonert — resatt til frisk demo.');
  console.log(`   Spill:    ${game.id} (${DEMO_GAME_NAME})`);
  console.log(`   Kortnavn: ${game.short_id}`);
  console.log(`   Arrangør: ${organizerLabel}`);
  console.log(`   Spillere: ${finalRoster.length}  (review-kontoen + ${CO_PLAYERS.length} gjester)`);
  console.log(`   Scores:   ${finalScores.length}`);
  console.log('   Innlogging: /en/review-login (passordet står ikke her og skal ikke logges)');
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
