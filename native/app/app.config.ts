// native/app/app.config.ts
// Native N8 (#1954, P2): butikk-varianten `APP_VARIANT=store`.
//
// `app.json` er dev-fasiten og røres ikke. Denne fila legger ett lag over den:
// uten `APP_VARIANT` gir den `app.json` tilbake nøyaktig som den er (låst i
// snapshot), og med `APP_VARIANT=store` bytter den identiteten til butikk-
// appen — samme bundle-id som TestFlight-skallet (`no.tornygolf.app`, team
// 8C8WCW67J9), så det nye bygget ERSTATTER skallet under samme oppføring.
//
// **To fail-closed-veier, begge før prebuild.** De tre `EXPO_PUBLIC_*`-
// verdiene bakes inn ved bundling, og ingenting stopper et butikkbygg med
// feil eller manglende adresse — appen kjører helt normalt til noen trykker
// «Slett konto» (`docs/native/app-spike.md`, bokførte gap under #1876).
// Configen evalueres FØR `expo prebuild`, og det er det billigste stedet å
// stoppe:
//
//  1. `store` KREVER prod-verten, en anon-nøkkel og nøyaktig
//     `https://tornygolf.no`. Mangler noe, kastes én melding som sier hvilke.
//  2. Uten `store`, med prod-verten → kast. Eierens telefonbygg (`expo run:ios
//     --configuration Release`) skal aldri kunne peke på prod ved et uhell.
//
// **Prod-verdiene kommer fra skall-miljøet, aldri fra en `.env`-fil.**
// `@expo/env` laster `.env.production.local` for ETHVERT Release-bygg — også
// eierens dev-bygg mot staging. Byggeskriptet (`scripts/store-build-ios.sh`)
// eksporterer verdiene i skallet, som vinner over `.env`-filene.
//
// **Fila er med vilje selvstendig.** `@expo/config` laster den gjennom Nodes
// egen TypeScript-stripping (eller `typescript.transpileModule` som reserve),
// og en relativ import av en annen `.ts`-fil er der vi ikke vil være avhengige
// av lasterens humør. Vertssammenligningen er derfor gjentatt fra
// `src/lib/stagingGate.ts` i stedet for importert — hel vert, aldri delstreng.
import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Prod-prosjektets Supabase-vert (ref `glofubopddkjhymcbaph`). */
export const PROD_SUPABASE_HOST = 'glofubopddkjhymcbaph.supabase.co';

/** Web-deployen butikkbygget snakker med. Sammenlignes nøyaktig, ingen skråstrek. */
export const STORE_WEB_BASE_URL = 'https://tornygolf.no';

/** Bundle-id (iOS) og pakkenavn (Android) — arvet fra skallene (#1279/#1283). */
export const STORE_BUNDLE_ID = 'no.tornygolf.app';

export const STORE_APP_NAME = 'Tørny';
export const STORE_SLUG = 'torny';

/** Må ligge over skallets `1.0` — App Store Connect avviser lavere versjon. */
export const STORE_VERSION = '1.1.0';

/**
 * `CFBundleVersion`. **Bump før hver opplasting** — App Store Connect avviser
 * et duplikat (versjon, build). Skallet brukte `1`; første kandidat er `2`.
 */
export const STORE_IOS_BUILD_NUMBER = '2';

/** Android-motstykket. Settes nå, brukes først av Android-oppfølgeren. */
export const STORE_ANDROID_VERSION_CODE = 2;

export type AppVariant = 'dev' | 'store';

/** Det configen leser fra miljøet. `process.env` passer rett inn. */
export type VariantEnv = Record<string, string | undefined>;

/**
 * `APP_VARIANT` → variant. Tom eller ikke satt er dev; alt annet enn nøyaktig
 * `store` kastes: en variant vi ikke kjenner skal ikke gjettes til noe.
 */
export function parseVariant(raw: string | undefined): AppVariant {
  const value = raw?.trim() ?? '';
  if (value === '') return 'dev';
  if (value === 'store') return 'store';
  throw new Error(
    `Ukjent APP_VARIANT «${raw}». Sett APP_VARIANT=store for butikkbygget, eller la den stå tom for dev-bygget.`
  );
}

// Skjema + autoritet, som i stagingGate.ts. Bevisst regex og ikke `new URL`:
// en config som kaster på en rar streng skal kaste MED en melding vi eier.
const AUTHORITY_PATTERN = /^https?:\/\/([^/?#]+)/i;

/** Verten i en http(s)-adresse, uten brukerinfo og port, eller `null`. */
function hostOf(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = AUTHORITY_PATTERN.exec(raw.trim());
  if (!match) return null;
  const authority = match[1];
  const host = authority
    .slice(authority.lastIndexOf('@') + 1)
    .replace(/:\d+$/, '')
    .toLowerCase();
  return host || null;
}

function storeProblems(env: VariantEnv): string[] {
  const problems: string[] = [];

  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    problems.push(`EXPO_PUBLIC_SUPABASE_URL mangler (skal være https://${PROD_SUPABASE_HOST}).`);
  } else if (hostOf(supabaseUrl) !== PROD_SUPABASE_HOST) {
    problems.push(
      `EXPO_PUBLIC_SUPABASE_URL peker på «${hostOf(supabaseUrl) ?? supabaseUrl}», ikke på prod-verten ${PROD_SUPABASE_HOST}.`
    );
  }

  // Aldri selve nøkkelen i meldingen — den havner i logger og PR-kommentarer.
  if (!env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY mangler.');
  }

  const webBaseUrl = env.EXPO_PUBLIC_WEB_BASE_URL;
  if (webBaseUrl !== STORE_WEB_BASE_URL) {
    problems.push(
      `EXPO_PUBLIC_WEB_BASE_URL må være nøyaktig ${STORE_WEB_BASE_URL} (fikk «${webBaseUrl ?? 'ingenting'}»).`
    );
  }

  return problems;
}

/**
 * Den oppløste Expo-configen for gitt variant og miljø.
 *
 * Ren funksjon: alt den trenger kommer inn som argumenter, så testen kan gå
 * gjennom hele tabellen av gyldige og ugyldige miljøer uten å røre
 * `process.env`.
 */
export function resolveConfig(base: Partial<ExpoConfig>, env: VariantEnv): ExpoConfig {
  const variant = parseVariant(env.APP_VARIANT);

  if (!base.name || !base.slug) {
    throw new Error('app.json mangler name eller slug — app.config.ts bygger på den statiske configen.');
  }

  if (variant === 'dev') {
    if (hostOf(env.EXPO_PUBLIC_SUPABASE_URL) === PROD_SUPABASE_HOST) {
      throw new Error(
        'Dev-bygg mot prod er ikke lov: EXPO_PUBLIC_SUPABASE_URL peker på prod-basen uten APP_VARIANT=store. ' +
          'Butikkbygget kjøres via native/app/scripts/store-build-ios.sh; dev-bygget skal ha staging-verdiene i native/app/.env.local.'
      );
    }
    return { ...base, name: base.name, slug: base.slug };
  }

  const problems = storeProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Butikkbygget (APP_VARIANT=store) stoppet før prebuild:\n- ${problems.join('\n- ')}\n` +
        'Prod-verdiene settes i skall-miljøet av native/app/scripts/store-build-ios.sh — aldri i en .env-fil.'
    );
  }

  return {
    ...base,
    name: STORE_APP_NAME,
    slug: STORE_SLUG,
    version: STORE_VERSION,
    ios: {
      ...base.ios,
      bundleIdentifier: STORE_BUNDLE_ID,
      buildNumber: STORE_IOS_BUILD_NUMBER,
      // Skallet hadde ITSAppUsesNonExemptEncryption=false i Info.plist: appen
      // bruker bare OS-ets HTTPS, og eksportkontroll-dialogen stilles aldri.
      config: { ...base.ios?.config, usesNonExemptEncryption: false },
      // Ingen `associatedDomains` med vilje (kontrakt §Research): appen kan
      // ikke bære en sesjon fra en lenke, så lenker skal åpnes i Safari.
    },
    android: {
      ...base.android,
      package: STORE_BUNDLE_ID,
      versionCode: STORE_ANDROID_VERSION_CODE,
    },
  };
}

const expoConfig = ({ config }: ConfigContext): ExpoConfig => resolveConfig(config, process.env);

export default expoConfig;
