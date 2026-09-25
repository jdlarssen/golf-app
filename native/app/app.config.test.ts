// native/app/app.config.test.ts
// Native N8 (#1954, P2): butikk-varianten `APP_VARIANT=store`.
//
// Én ren funksjon, tre påstander som må stå:
//
//  1. **Dev er bit-identisk med `app.json`.** Uten variant skal `app.config.ts`
//     ikke endre ett eneste felt — eierens telefonbygg og alle øktene bygger
//     videre på nøyaktig det de bygde på i går. Snapshotet låser det.
//  2. **Butikk uten prod-miljø stopper.** Alle tre `EXPO_PUBLIC_*`-verdiene
//     bakes inn ved bundling (`docs/native/app-spike.md`), og ingenting annet
//     stopper et butikkbygg med feil adresse — appen kjører helt normalt til
//     noen trykker «Slett konto». Kastet skjer før prebuild, det billigste
//     stedet, og meldingen sier hvilken verdi som er feil.
//  3. **Dev mot prod stopper.** Motsatt vei: et bygg uten `store`-variant som
//     peker på prod-basen er et uhell, og skal aldri kunne bli en app på en
//     telefon.
//  4. **Hver `EXPO_PUBLIC_*` appen leser er merket** som butikk eller dev
//     (#2208). Butikkbygget nekter dev-nøklene, så en ny nøkkel som ikke står
//     på noen av listene, ville sluppet forbi den sperren.
//
// Verten sammenlignes hel, som i `src/lib/stagingGate.ts` — prod-verten som
// delstreng i et annet domene er ikke prod.
import { readdirSync, readFileSync } from 'fs';
import { join, sep } from 'path';
import type { ExpoConfig } from 'expo/config';
import appJson from './app.json';
import {
  DEV_ONLY_PUBLIC_ENV_KEYS,
  PROD_SUPABASE_HOST,
  STORE_ANDROID_VERSION_CODE,
  STORE_BUNDLE_ID,
  STORE_IOS_BUILD_NUMBER,
  STORE_PUBLIC_ENV_KEYS,
  STORE_WEB_BASE_URL,
  parseVariant,
  resolveConfig,
} from './app.config';
import { STAGING_SUPABASE_HOST } from './src/lib/stagingGate';

// JSON-importen typer `orientation` som `string`; Expo vil ha unionen. Castet
// sier bare det `expo config` alt har bevist: app.json ER en gyldig config.
const base = appJson.expo as ExpoConfig;
const PROD_URL = `https://${PROD_SUPABASE_HOST}`;
const STAGING_URL = `https://${STAGING_SUPABASE_HOST}`;
const DEV_LOGIN_PASSWORD = 'testpassord-i-test-2208';

const STORE_ENV = {
  APP_VARIANT: 'store',
  EXPO_PUBLIC_SUPABASE_URL: PROD_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-nokkel-i-test',
  EXPO_PUBLIC_WEB_BASE_URL: STORE_WEB_BASE_URL,
};

// Passordet hører hjemme i dev-bygget (#1923). Står det her, viser de to
// bit-identisk-testene og snapshotet at dev-bygget ikke merker sperren.
const DEV_ENV = {
  EXPO_PUBLIC_SUPABASE_URL: STAGING_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-nokkel-i-test',
  EXPO_PUBLIC_WEB_BASE_URL: 'http://localhost:3111',
  EXPO_PUBLIC_DEV_LOGIN_PASSWORD: DEV_LOGIN_PASSWORD,
};

describe('resolveConfig — dev-varianten (ingen APP_VARIANT)', () => {
  it('er bit-identisk med app.json uten miljø', () => {
    expect(resolveConfig(base, {})).toStrictEqual(base);
  });

  it('er bit-identisk med app.json med staging-verdiene satt', () => {
    expect(resolveConfig(base, DEV_ENV)).toStrictEqual(base);
  });

  it('snapshot', () => {
    expect(resolveConfig(base, DEV_ENV)).toMatchSnapshot();
  });

  it.each([
    ['prod-verten', PROD_URL],
    ['prod-verten med sti', `${PROD_URL}/rest/v1`],
    ['prod-verten med port', `${PROD_URL}:443`],
    ['prod-verten med store bokstaver', PROD_URL.toUpperCase()],
  ])('nekter dev-bygg mot %s', (_label, url) => {
    expect(() => resolveConfig(base, { ...DEV_ENV, EXPO_PUBLIC_SUPABASE_URL: url })).toThrow(
      /dev-bygg mot prod er ikke lov/i
    );
  });

  it('godtar prod-verten som delstreng i et annet domene — det er ikke prod', () => {
    const url = `https://${PROD_SUPABASE_HOST}.angriper.no`;
    expect(resolveConfig(base, { ...DEV_ENV, EXPO_PUBLIC_SUPABASE_URL: url })).toStrictEqual(base);
  });
});

describe('resolveConfig — butikk-varianten (APP_VARIANT=store)', () => {
  it('snapshot', () => {
    expect(resolveConfig(base, STORE_ENV)).toMatchSnapshot();
  });

  it('setter identiteten fra kontraktens §3-tabell', () => {
    const cfg = resolveConfig(base, STORE_ENV);
    expect(cfg.name).toBe('Tørny');
    expect(cfg.slug).toBe('torny');
    expect(cfg.version).toBe('1.1.0');
    expect(cfg.ios?.bundleIdentifier).toBe(STORE_BUNDLE_ID);
    // Build-nummeret leses fra konstanten, ikke som literal: tallet bumpes
    // før hver opplasting, og en kopi her ville bare vært et sted til å
    // glemme. Selve VERDIEN er låst av snapshotet over — endrer den seg,
    // vises den i snapshot-diffen (#1988).
    expect(cfg.ios?.buildNumber).toBe(STORE_IOS_BUILD_NUMBER);
    expect(cfg.ios?.config?.usesNonExemptEncryption).toBe(false);
    expect(cfg.android?.package).toBe(STORE_BUNDLE_ID);
    expect(cfg.android?.versionCode).toBe(STORE_ANDROID_VERSION_CODE);
  });

  it('setter ingen associated domains — lenker skal åpnes i Safari, der sesjonen finnes', () => {
    expect(resolveConfig(base, STORE_ENV).ios?.associatedDomains).toBeUndefined();
  });

  it('lar resten av app.json stå: ikon, splash, plugins, tablet-valget', () => {
    const cfg = resolveConfig(base, STORE_ENV);
    expect(cfg.icon).toBe(base.icon);
    expect(cfg.plugins).toEqual(base.plugins);
    expect(cfg.ios?.supportsTablet).toBe(base.ios?.supportsTablet);
    expect(cfg.android?.adaptiveIcon).toEqual(base.android?.adaptiveIcon);
  });

  it.each([
    ['Supabase-adressen mangler', { EXPO_PUBLIC_SUPABASE_URL: undefined }, 'EXPO_PUBLIC_SUPABASE_URL'],
    ['Supabase-adressen er tom', { EXPO_PUBLIC_SUPABASE_URL: '   ' }, 'EXPO_PUBLIC_SUPABASE_URL'],
    ['Supabase-adressen peker på staging', { EXPO_PUBLIC_SUPABASE_URL: STAGING_URL }, STAGING_SUPABASE_HOST],
    ['Supabase-adressen mangler skjema', { EXPO_PUBLIC_SUPABASE_URL: PROD_SUPABASE_HOST }, 'ikke en http(s)-adresse'],
    [
      'Supabase-adressen har prod-verten som delstreng i et annet domene',
      { EXPO_PUBLIC_SUPABASE_URL: `https://${PROD_SUPABASE_HOST}.angriper.no` },
      'EXPO_PUBLIC_SUPABASE_URL',
    ],
    ['anon-nøkkelen mangler', { EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined }, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
    ['anon-nøkkelen er bare mellomrom', { EXPO_PUBLIC_SUPABASE_ANON_KEY: '  ' }, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
    ['web-adressen mangler', { EXPO_PUBLIC_WEB_BASE_URL: undefined }, 'EXPO_PUBLIC_WEB_BASE_URL'],
    ['web-adressen er Mac-en', { EXPO_PUBLIC_WEB_BASE_URL: 'http://localhost:3111' }, 'localhost:3111'],
    ['web-adressen har skråstrek på slutten', { EXPO_PUBLIC_WEB_BASE_URL: `${STORE_WEB_BASE_URL}/` }, 'EXPO_PUBLIC_WEB_BASE_URL'],
    [
      'testpassordet fra native/app/.env.local er satt',
      { EXPO_PUBLIC_DEV_LOGIN_PASSWORD: DEV_LOGIN_PASSWORD },
      'EXPO_PUBLIC_DEV_LOGIN_PASSWORD',
    ],
  ])('stopper når %s, og sier det', (_label, override, expectedFragment) => {
    expect(() => resolveConfig(base, { ...STORE_ENV, ...override })).toThrow(expectedFragment);
  });

  it.each([
    ['tomt', ''],
    ['bare mellomrom', '   '],
  ])('godtar testpassordet når det er %s — da finnes ingenting å bake inn', (_label, value) => {
    expect(resolveConfig(base, { ...STORE_ENV, EXPO_PUBLIC_DEV_LOGIN_PASSWORD: value })).toStrictEqual(
      resolveConfig(base, STORE_ENV)
    );
  });

  it('nevner alle feilene i én melding, ikke bare den første', () => {
    let message = '';
    try {
      resolveConfig(base, { APP_VARIANT: 'store' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(message).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(message).toContain('EXPO_PUBLIC_WEB_BASE_URL');
  });

  it('skriver aldri anon-nøkkelen inn i feilmeldingen', () => {
    let message = '';
    try {
      resolveConfig(base, { ...STORE_ENV, EXPO_PUBLIC_WEB_BASE_URL: undefined });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain(STORE_ENV.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  });

  it('nevner testpassordet ved navn, aldri verdien', () => {
    let message = '';
    try {
      resolveConfig(base, { ...STORE_ENV, EXPO_PUBLIC_DEV_LOGIN_PASSWORD: DEV_LOGIN_PASSWORD });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('EXPO_PUBLIC_DEV_LOGIN_PASSWORD');
    expect(message).not.toContain(DEV_LOGIN_PASSWORD);
  });
});

describe('EXPO_PUBLIC_-nøklene appen leser', () => {
  // Babel-pluginen inliner både `process.env.X` og `process.env['X']`.
  const ENV_READ = /process\.env(?:\.|\[['"])(EXPO_PUBLIC_[A-Z0-9_]+)/g;

  function appSourceFiles(): string[] {
    const src = join(__dirname, 'src');
    const nested = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((rel) => /\.tsx?$/.test(rel) && !/\.test\./.test(rel) && !rel.startsWith(`test${sep}`))
      .map((rel) => join(src, rel));
    return [...nested, join(__dirname, 'App.tsx'), join(__dirname, 'index.ts')];
  }

  it('er alle merket som butikk eller dev', () => {
    const found = new Set<string>();
    for (const file of appSourceFiles()) {
      for (const match of readFileSync(file, 'utf8').matchAll(ENV_READ)) found.add(match[1]);
    }
    const known: string[] = [...STORE_PUBLIC_ENV_KEYS, ...DEV_ONLY_PUBLIC_ENV_KEYS];
    // Skanneren finner noe, og ingen av listene er foreldet.
    expect([...found]).toEqual(expect.arrayContaining(known));
    // En ny nøkkel må merkes før testen går grønt.
    expect([...found].filter((key) => !known.includes(key)).sort()).toEqual([]);
  });
});

describe('parseVariant', () => {
  it.each([
    ['ikke satt', undefined],
    ['tom', ''],
    ['bare mellomrom', '  '],
  ])('leser %s som dev', (_label, raw) => {
    expect(parseVariant(raw)).toBe('dev');
  });

  it('leser «store» som butikk', () => {
    expect(parseVariant('store')).toBe('store');
  });

  it.each(['Store', 'STORE', 'prod', 'production', 'release'])(
    'nekter «%s» — ingen gjetting på hva som var ment',
    (raw) => {
      expect(() => parseVariant(raw)).toThrow(/APP_VARIANT/);
    }
  );
});
