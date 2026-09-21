// native/app/src/devLogin.ts
// Native #1923: tapp-innlogging som testbruker i Tørny Dev (staging).
//
// Eieren tester appen på telefonen flere ganger om dagen, og OTP-koden på
// e-post går på stagings SMTP-tak etter noen få forsøk. Her logger ett trykk
// på et navn inn som den testbrukeren, med ett felles passord.
//
// **Gaten er tredobbel, og hver del alene stopper prod:**
//   (a) `EXPO_PUBLIC_DEV_LOGIN_PASSWORD` mangler eller er tom → ingen config.
//       Passordet finnes bare i eierens gitignorerte `native/app/.env.local`;
//       butikk-bygget (`store-build-ios.sh`) setter det aldri.
//   (b) Supabase-verten er ikke staging → ingen config. Samme regel som
//       utviklerraden i profil-rommet (`lib/stagingGate.ts`), ikke en kopi.
//   (c) Prod har ingen `dev-login`-bucket → lista blir tom selv om (a) og (b)
//       skulle svikte.
// `__DEV__` duger ikke: eierens telefonbygg er Release.
//
// **Env leses BOKSTAVELIG.** Expo inliner `EXPO_PUBLIC_*` bare ved
// `process.env.EXPO_PUBLIC_NAVN`-tilgang — aldri `process.env[navn]` eller
// destrukturering. Derfor står begge navnene skrevet ut i `readDevLoginEnv`.
//
// **Ingen egen tømming av den lokale basen.** Kontrakten ba om `wipeLocalData`
// før innloggingen, men eier-vakten fra #1942 (`OwnerGate` i `App.tsx`) gjør
// nettopp det for ENHVER innlogging: annen bruker enn sist → tøm før stacken
// monteres. En ekstra wipe her ville i tillegg slettet uleverte slag når
// eieren logger inn igjen som samme testbruker — det vakten bevisst lar være.
//
// Lista (`users.json`) vedlikeholdes av `scripts/dev-login-users.mjs`. Nye
// testbrukere dukker opp neste gang skjermen åpnes, uten nytt bygg.
import { isStagingUrl } from './lib/stagingGate';
import { supabase } from './supabase';

export const DEV_LOGIN_BUCKET = 'dev-login';
export const DEV_LOGIN_OBJECT = 'users.json';

/** Hvor lenge skjermen venter på lista før den gir opp og viser skjemaet alene. */
export const DEV_LOGIN_FETCH_TIMEOUT_MS = 5_000;

export type DevLoginRole = 'admin' | 'arrangor' | 'spiller';

export interface DevLoginUser {
  email: string;
  label: string;
  role: DevLoginRole;
}

export interface DevLoginConfig {
  supabaseUrl: string;
  password: string;
}

export interface DevLoginEnv {
  supabaseUrl?: string;
  password?: string;
}

export const DEV_LOGIN_ROLE_LABEL: Record<DevLoginRole, string> = {
  admin: 'Admin',
  arrangor: 'Arrangør',
  spiller: 'Spiller',
};

export const DEV_LOGIN_TEXT = {
  sectionTitle: 'Testbrukere (staging)',
  divider: 'eller med e-post',
  signInLabel: (label: string) => `Logg inn som ${label}`,
  signInFailed: (label: string) =>
    `Fikk ikke logget inn som ${label}. Passordet i appen er kanskje utdatert. ` +
    'Be en økt kjøre synk-skriptet for testbrukere, eller bygg appen på nytt.',
} as const;

/** De to env-verdiene, lest bokstavelig så Metro kan inline dem. */
export function readDevLoginEnv(): DevLoginEnv {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    password: process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD,
  };
}

/** Config kun når passordet er satt OG verten er staging. Ellers `null`. */
export function resolveDevLoginConfig(env: DevLoginEnv): DevLoginConfig | null {
  const password = env.password ?? '';
  if (!password.trim()) return null;
  if (!env.supabaseUrl || !isStagingUrl(env.supabaseUrl)) return null;
  return { supabaseUrl: env.supabaseUrl.trim().replace(/\/+$/, ''), password };
}

const ROLES: readonly DevLoginRole[] = ['admin', 'arrangor', 'spiller'];

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * `users.json` → knappene. Ugyldig form gir `[]`, oppføringer uten e-post
 * eller navn droppes, ukjent rolle blir «spiller», og ved duplikat-e-post
 * vinner den første. Rekkefølgen i fila er rekkefølgen på skjermen.
 */
export function parseDevLoginUsers(json: unknown): DevLoginUser[] {
  if (!json || typeof json !== 'object') return [];
  const users = (json as { users?: unknown }).users;
  if (!Array.isArray(users)) return [];
  const seen = new Set<string>();
  const out: DevLoginUser[] = [];
  for (const entry of users) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const email = nonEmptyString(record.email);
    const label = nonEmptyString(record.label);
    if (!email || !label) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const role = ROLES.includes(record.role as DevLoginRole)
      ? (record.role as DevLoginRole)
      : 'spiller';
    out.push({ email, label, role });
  }
  return out;
}

/**
 * Henter lista fra stagings public bucket. Cache-bustet: Free-tier har ikke
 * Smart CDN, så uten `?t=` kunne en ny testbruker latt vente på seg i en time.
 * Alt annet enn 200 + gyldig JSON gir `[]`, og funksjonen kaster aldri — en
 * feil her skal bare bety at skjermen ser ut som før.
 */
export async function fetchDevLoginUsers(
  config: DevLoginConfig,
  signal?: AbortSignal,
): Promise<DevLoginUser[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEV_LOGIN_FETCH_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);
  try {
    const url =
      `${config.supabaseUrl}/storage/v1/object/public/` +
      `${DEV_LOGIN_BUCKET}/${DEV_LOGIN_OBJECT}?t=${Date.now()}`;
    const response = await fetch(url, { signal: controller.signal });
    if (response.status !== 200) return [];
    return parseDevLoginUsers(await response.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Logg inn som testbrukeren. `App.tsx` bytter til stacken selv på
 * `SIGNED_IN`, og eier-vakten tømmer basen om brukeren er en annen enn sist.
 * Feilen er vår tekst, aldri Supabases.
 */
export async function signInAsDevUser(
  user: DevLoginUser,
  config: DevLoginConfig,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: config.password,
    });
    return { error: error ? DEV_LOGIN_TEXT.signInFailed(user.label) : null };
  } catch {
    return { error: DEV_LOGIN_TEXT.signInFailed(user.label) };
  }
}
