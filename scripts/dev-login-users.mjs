#!/usr/bin/env node
/**
 * Testbrukerne i Tørny Dev (#1923): kontoene og lista appen viser som
 * trykk-knapper på innloggingsskjermen.
 *
 *   node scripts/dev-login-users.mjs                 # = sync
 *   node scripts/dev-login-users.mjs sync            # rollebesetning + passord + bucket + fil
 *   node scripts/dev-login-users.mjs add --email torny+dev-<slug>@example.test --name "<Navn>" \
 *       [--role spiller|arrangor|admin] [--hcp 18] [--issue N]
 *   node scripts/dev-login-users.mjs remove --email <e>
 *   node scripts/dev-login-users.mjs list
 *
 * KUN staging. Skriptet leser bare `.env.staging.local` og nekter før første
 * kall om URL-en ikke er staging-prosjektet. Det krever
 * `SUPABASE_SERVICE_ROLE_KEY` og `DEV_LOGIN_PASSWORD` (samme verdi som
 * `EXPO_PUBLIC_DEV_LOGIN_PASSWORD` i `native/app/.env.local`). Passordet
 * skrives aldri ut.
 *
 * Lista bor som `users.json` i den offentlige bucketen `dev-login` på
 * staging. Bucketen lages her og ikke i en migrasjon: migrasjoner kjører i
 * prod også, og fila skal aldri finnes der. Fila er verdensleselig for den
 * som kjenner staging-URL-en, så den inneholder bare syntetiske
 * `@example.test`-adresser.
 *
 * Idempotent — kjør så ofte du vil. Detaljer: docs/native/app-spike.md
 * «Testbrukere i appen».
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STAGING_ENV = '.env.staging.local';
const STAGING_REF = 'snwmueecmfqqdurxedxv';
const BUCKET = 'dev-login';
const OBJECT = 'users.json';
const MIN_PASSWORD_LENGTH = 24;
const ROLES = ['admin', 'arrangor', 'spiller'];

/** Rollebesetningen. Fast rekkefølge = rekkefølgen i appen. */
const CAST = [
  { email: 'torny+dev-admin@example.test', label: 'Anne Admin', role: 'admin', hcp: 12 },
  { email: 'torny+tapptest1909-arrangor@example.test', label: 'Kari Arrangør', role: 'arrangor', hcp: 18 },
  { email: 'torny+tapptest1909-kompis@example.test', label: 'Ola Kompis', role: 'spiller', hcp: 18 },
  { email: 'torny+dev-putter@example.test', label: 'Per Putter', role: 'spiller', hcp: 18 },
  { email: 'torny+tapptest1909-spiller@example.test', label: 'Testspiller Tapp', role: 'spiller', hcp: 18 },
];
const CAST_EMAILS = new Set(CAST.map((c) => c.email));

// ------------------------------------------------------------------ hjelpere
// loadEnv, ok, waitForUsersRow, updateUserRow og findAuthUserId er kopiert fra
// scripts/provision-review-account.mjs (#1284). To skript, ingen delt modul
// ennå — trekk dem ut når et tredje trenger dem.

function loadEnv(file) {
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), file), 'utf8');
  } catch {
    throw new Error(`Fant ikke ${file} i ${process.cwd()} — kjør skriptet fra rota av worktreet.`);
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

/** Kaster på enhver feil, så en halv kjøring aldri ser ut som suksess. */
function ok(label, { data, error }) {
  if (error) {
    throw new Error(`${label}: ${error.message}${error.details ? ` — ${error.details}` : ''}`);
  }
  return data ?? [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

/** Poll på `public.users`-raden triggeren lager etter `createUser`. */
async function waitForUsersRow(db, userId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = ok('les users', await db.from('users').select('id').eq('id', userId));
    if (rows.length > 0) return true;
    await sleep(200);
  }
  return false;
}

/** Oppdater og BEKREFT én truffet rad (AGENTS.md trap 2). */
async function updateUserRow(db, userId, patch, label) {
  const rows = ok(label, await db.from('users').update(patch).eq('id', userId).select('id'));
  if (rows.length !== 1) {
    throw new Error(`${label}: traff ${rows.length} rader, forventet 1`);
  }
}

/** Finn auth-brukeren for adressen. `public.users` først, så GoTrue-paging. */
async function findAuthUserId(db, email) {
  const rows = ok(
    'slå opp users på e-post',
    await db.from('users').select('id, email').ilike('email', email).limit(20),
  );
  const exact = rows.filter((r) => (r.email ?? '').toLowerCase() === email.toLowerCase());
  if (exact.length > 0) return exact[0].id;

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}

function requireNode22() {
  const major = Number(process.versions.node.split('.')[0]);
  if (Number.isFinite(major) && major < 22) {
    throw new Error(
      `Node ${process.versions.node} er for gammel — kjør først: source ~/.nvm/nvm.sh && nvm use 22`,
    );
  }
}

// ------------------------------------------------------------ argumenter
function parseArgs(argv) {
  const [first, ...rest] = argv;
  const command = first && !first.startsWith('--') ? first : 'sync';
  const flagArgs = first && !first.startsWith('--') ? rest : argv;
  const flags = {};
  for (let i = 0; i < flagArgs.length; i++) {
    const arg = flagArgs[i];
    if (!arg.startsWith('--')) throw new Error(`Ukjent argument: ${arg}`);
    const eq = arg.indexOf('=');
    if (eq > 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const value = flagArgs[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} mangler verdi`);
      }
      flags[arg.slice(2)] = value;
      i++;
    }
  }
  if (!['sync', 'add', 'remove', 'list'].includes(command)) {
    throw new Error(`Ukjent kommando «${command}» (bruk sync, add, remove eller list)`);
  }
  return { command, flags };
}

// ------------------------------------------------------------ oppsett
function setup({ needPassword }) {
  const env = loadEnv(STAGING_ENV);
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  // Hard vakt: helt vert, ikke delstreng. Stopper FØR første kall.
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    // tom vert → nektes under
  }
  if (host !== `${STAGING_REF}.supabase.co`) {
    throw new Error(
      `${STAGING_ENV} peker ikke på staging (${STAGING_REF}) — nekter å skrive. Fikk «${host || url}».`,
    );
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error(`${STAGING_ENV} mangler SUPABASE_SERVICE_ROLE_KEY`);
  const password = env.DEV_LOGIN_PASSWORD ?? '';
  if (needPassword && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `DEV_LOGIN_PASSWORD i ${STAGING_ENV} mangler eller er kortere enn ${MIN_PASSWORD_LENGTH} tegn.\n` +
        '  Lag et med: openssl rand -base64 30',
    );
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { db, url, password };
}

// ------------------------------------------------------------ bucket + fil
async function ensureBucket(db) {
  const { data, error } = await db.storage.getBucket(BUCKET);
  if (data && !error) return false;
  ok(
    `opprett bucket ${BUCKET}`,
    await db.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 65536,
      allowedMimeTypes: ['application/json'],
    }),
  );
  return true;
}

/**
 * Eksisterende `users.json`, eller null om den ikke finnes ennå. Bare en
 * fil som beviselig mangler gir null — enhver annen feil kaster, ellers ville
 * en forbigående storage-feil latt `sync`/`add` skrive lista på nytt uten de
 * ekstra brukerne.
 */
async function readList(db) {
  const entries = ok(`list ${BUCKET}`, await db.storage.from(BUCKET).list('', { search: OBJECT }));
  if (!entries.some((e) => e.name === OBJECT)) return null;
  const { data, error } = await db.storage.from(BUCKET).download(OBJECT);
  if (error || !data) throw new Error(`last ned ${OBJECT}: ${error?.message ?? 'tomt svar'}`);
  const json = JSON.parse(await data.text());
  return Array.isArray(json?.users) ? json.users : [];
}

async function writeList(db, users) {
  const body = JSON.stringify({ version: 1, updatedAt: nowIso(), users }, null, 2);
  ok(
    `last opp ${OBJECT}`,
    await db.storage.from(BUCKET).upload(OBJECT, body, {
      upsert: true,
      contentType: 'application/json',
      // Free-tier har ikke Smart CDN. Uten 0 kunne CDN-et holdt på den gamle
      // lista i en time (default max-age 3600).
      cacheControl: '0',
    }),
  );
}

/** Rollebesetning først i fast rekkefølge, deretter ekstra etter `addedAt`. */
function composeList(extras) {
  const cast = CAST.map(({ email, label, role }) => ({ email, label, role, origin: 'cast' }));
  const sorted = [...extras].sort((a, b) => String(a.addedAt ?? '').localeCompare(String(b.addedAt ?? '')));
  return [...cast, ...sorted];
}

function printList(users) {
  for (const u of users) {
    console.log(`  ${u.label} · ${u.role} · ${u.email} · ${u.origin ?? ''}`);
  }
}

// ------------------------------------------------------------ brukere
/** Opprett eller finn kontoen, sett passordet og en komplett profil. */
async function ensureUser(db, { email, label, role, hcp }, password) {
  let userId = await findAuthUserId(db, email);
  let created = false;
  if (userId) {
    ok(
      `oppdater passord ${email}`,
      await db.auth.admin.updateUserById(userId, { password, email_confirm: true }),
    );
  } else {
    const res = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (res.error) throw new Error(`createUser ${email}: ${res.error.message}`);
    userId = res.data.user.id;
    created = true;
  }
  if (!(await waitForUsersRow(db, userId))) {
    throw new Error(`users-raden for ${email} dukket ikke opp`);
  }
  const now = nowIso();
  await updateUserRow(
    db,
    userId,
    {
      name: label,
      hcp_index: hcp,
      handicap_updated_at: now,
      profile_completed_at: now,
      gender: 'mens',
      level: 'normal',
      is_guest: false,
      is_admin: role === 'admin',
      deleted_at: null,
    },
    `profil ${email}`,
  );
  console.log(`  ${created ? 'opprettet' : 'oppdatert'}: ${label} <${email}> (${role})`);
  return userId;
}

/** Ekstra brukere: roter passordet, dropp dem som ikke finnes lenger. */
async function refreshExtras(db, extras, password) {
  const kept = [];
  for (const entry of extras) {
    const userId = await findAuthUserId(db, entry.email);
    if (!userId) {
      console.log(`  droppet fra lista (finnes ikke lenger): ${entry.label} <${entry.email}>`);
      continue;
    }
    ok(
      `oppdater passord ${entry.email}`,
      await db.auth.admin.updateUserById(userId, { password, email_confirm: true }),
    );
    console.log(`  oppdatert: ${entry.label} <${entry.email}> (${entry.role}, ${entry.origin})`);
    kept.push(entry);
  }
  return kept;
}

function extrasOf(list) {
  return (list ?? []).filter((u) => u && u.origin !== 'cast' && !CAST_EMAILS.has(u.email));
}

// ------------------------------------------------------------ kommandoer
async function sync() {
  const { db, url, password } = setup({ needPassword: true });
  console.log(`Skriver til: ${url}`);
  if (await ensureBucket(db)) console.log(`Bucket «${BUCKET}» opprettet.`);
  console.log('Rollebesetning:');
  for (const member of CAST) await ensureUser(db, member, password);
  const existing = await readList(db);
  const extras = extrasOf(existing);
  if (extras.length > 0) console.log('Ekstra brukere:');
  const kept = await refreshExtras(db, extras, password);
  const list = composeList(kept);
  await writeList(db, list);
  console.log(`\n${OBJECT} (${list.length}):`);
  printList(list);
}

async function add(flags) {
  const email = (flags.email ?? '').trim().toLowerCase();
  const label = (flags.name ?? '').trim();
  const role = flags.role ?? 'spiller';
  const hcp = flags.hcp === undefined ? 18 : Number(flags.hcp);
  if (!email || !label) throw new Error('add krever --email og --name');
  if (!email.endsWith('@example.test')) {
    throw new Error('Bare syntetiske @example.test-adresser — lista er verdensleselig.');
  }
  if (!ROLES.includes(role)) throw new Error(`--role må være ${ROLES.join(', ')}`);
  if (!Number.isFinite(hcp) || hcp < -10 || hcp > 54) throw new Error('--hcp må være et tall mellom -10 og 54');
  if (CAST_EMAILS.has(email)) {
    throw new Error(`${email} finnes i rollebesetningen — den styres av sync, ikke add.`);
  }
  const { db, url, password } = setup({ needPassword: true });
  console.log(`Skriver til: ${url}`);
  await ensureBucket(db);
  await ensureUser(db, { email, label, role, hcp }, password);
  const extras = extrasOf(await readList(db));
  const origin = flags.issue ? `#${String(flags.issue).replace(/^#/, '')}` : 'manuell';
  const existing = extras.find((u) => u.email === email);
  const entry = { email, label, role, origin, addedAt: existing?.addedAt ?? nowIso() };
  const next = [...extras.filter((u) => u.email !== email), entry];
  const list = composeList(next);
  await writeList(db, list);
  console.log(`\n${OBJECT} (${list.length}):`);
  printList(list);
}

async function remove(flags) {
  const email = (flags.email ?? '').trim().toLowerCase();
  if (!email) throw new Error('remove krever --email');
  if (CAST_EMAILS.has(email)) {
    throw new Error(`${email} er i rollebesetningen og kan ikke fjernes.`);
  }
  const { db, url } = setup({ needPassword: false });
  console.log(`Skriver til: ${url}`);
  const extras = extrasOf(await readList(db));
  if (!extras.some((u) => u.email === email)) {
    throw new Error(`${email} står ikke i lista.`);
  }
  const list = composeList(extras.filter((u) => u.email !== email));
  await writeList(db, list);
  console.log(`Fjernet ${email} fra lista (kontoen er urørt).\n${OBJECT} (${list.length}):`);
  printList(list);
}

async function list() {
  const { db } = setup({ needPassword: false });
  const users = await readList(db);
  if (users === null) {
    console.log(`${OBJECT} finnes ikke ennå — kjør sync.`);
    return;
  }
  console.log(`${OBJECT} (${users.length}):`);
  printList(users);
}

async function main() {
  requireNode22();
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'sync') await sync();
  else if (command === 'add') await add(flags);
  else if (command === 'remove') await remove(flags);
  else await list();
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
