import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_LAUNCH_SWAPS,
  appBannerStores,
  appLaunchFlag,
  appLaunchKey,
  deviceStoreUrl,
  isAppLaunched,
  isLaunchSwap,
  launchedSibling,
  parseAppLaunch,
  storesFor,
  type AppLaunchFlag,
  type StorePlatform,
} from './appLaunch';
import { APP_STORE_URL, GOOGLE_PLAY_URL, type Store } from './storeLinks';
import no from '@/messages/no.json';
import en from '@/messages/en.json';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseAppLaunch', () => {
  it.each([
    ['ios', 'ios'],
    ['on', 'on'],
    ['off', 'off'],
  ] as const)('maps %s to %s', (raw, expected) => {
    expect(parseAppLaunch(raw)).toBe(expected);
  });

  it.each([undefined, null, '', 'true', 'ON', 'IOS', 'yes', 'android'])(
    'falls back to off for unrecognised value %s',
    (raw) => {
      expect(parseAppLaunch(raw)).toBe('off');
    },
  );
});

describe('appLaunchFlag', () => {
  it('is off when the variable is not set', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', undefined);
    expect(appLaunchFlag()).toBe('off');
  });

  it('reads the variable at call time', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', 'on');
    expect(appLaunchFlag()).toBe('on');
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', 'ios');
    expect(appLaunchFlag()).toBe('ios');
  });
});

describe('isAppLaunched', () => {
  it.each([
    ['off', false],
    ['ios', true],
    ['on', true],
  ] as const)('%s → %s', (flag, expected) => {
    expect(isAppLaunched(flag)).toBe(expected);
  });
});

describe('storesFor', () => {
  it.each<[AppLaunchFlag, StorePlatform, Store[]]>([
    // off: nothing anywhere
    ['off', 'ios', []],
    ['off', 'android', []],
    ['off', 'other', []],
    ['off', 'unknown', []],
    // ios: App Store, but Android phones get no card
    ['ios', 'ios', ['appStore']],
    ['ios', 'other', ['appStore']],
    ['ios', 'unknown', ['appStore']],
    ['ios', 'android', []],
    // on: the device's own store; a PC and the server render get both
    ['on', 'ios', ['appStore']],
    ['on', 'android', ['googlePlay']],
    ['on', 'other', ['appStore', 'googlePlay']],
    ['on', 'unknown', ['appStore', 'googlePlay']],
  ])('%s on %s → %j', (flag, platform, expected) => {
    expect(storesFor(flag, platform)).toEqual(expected);
  });
});

describe('deviceStoreUrl', () => {
  it.each<[AppLaunchFlag, StorePlatform, string | null]>([
    ['on', 'ios', APP_STORE_URL],
    ['on', 'android', GOOGLE_PLAY_URL],
    // a PC and the first render keep /demo (the pointer page)
    ['on', 'other', null],
    ['on', 'unknown', null],
    // ios: the buttons stay as they are
    ['ios', 'ios', null],
    ['ios', 'android', null],
    ['off', 'ios', null],
    ['off', 'android', null],
  ])('%s on %s → %s', (flag, platform, expected) => {
    expect(deviceStoreUrl(flag, platform)).toBe(expected);
  });
});

describe('appBannerStores', () => {
  it.each<[AppLaunchFlag, StorePlatform, Store[]]>([
    ['off', 'ios', []],
    ['off', 'other', []],
    // ios: only iPhone/iPad swap the home-screen banner
    ['ios', 'ios', ['appStore']],
    ['ios', 'other', []],
    ['ios', 'android', []],
    // on: everyone
    ['on', 'ios', ['appStore']],
    ['on', 'android', ['googlePlay']],
    ['on', 'other', ['appStore', 'googlePlay']],
    // the platform is not known yet: no decision
    ['on', 'unknown', []],
    ['ios', 'unknown', []],
  ])('%s on %s → %j', (flag, platform, expected) => {
    expect(appBannerStores(flag, platform)).toEqual(expected);
  });
});

describe('launchedSibling', () => {
  it.each([
    ['hero.trust', 'hero.trustLaunched'],
    ['metaTitle', 'metaTitleLaunched'],
    ['faq.2', 'faq2Launched'],
    ['sections.2.body', 'sections2BodyLaunched'],
  ])('%s → %s', (key, expected) => {
    expect(launchedSibling(key)).toBe(expected);
  });
});

describe('appLaunchKey', () => {
  it('keeps the old key while the switch is off', () => {
    expect(appLaunchKey('landing', 'hero.trust', 'off')).toBe('hero.trust');
    expect(appLaunchKey('landing', 'hero.primaryCta', 'off')).toBe(
      'hero.primaryCta',
    );
  });

  it('swaps the text keys with both ios and on', () => {
    expect(appLaunchKey('landing', 'hero.trust', 'ios')).toBe(
      'hero.trustLaunched',
    );
    expect(appLaunchKey('landing', 'hero.trust', 'on')).toBe(
      'hero.trustLaunched',
    );
  });

  it('swaps the demo buttons only with on', () => {
    expect(appLaunchKey('landing', 'hero.primaryCta', 'ios')).toBe(
      'hero.primaryCta',
    );
    expect(appLaunchKey('landing', 'hero.primaryCta', 'on')).toBe(
      'hero.primaryCtaLaunched',
    );
  });

  it('isLaunchSwap agrees with appLaunchKey for every listed key', () => {
    for (const flag of ['off', 'ios', 'on'] as const) {
      for (const [ns, keys] of Object.entries(APP_LAUNCH_SWAPS)) {
        for (const key of Object.keys(keys)) {
          const swapped = isLaunchSwap(
            ns as keyof typeof APP_LAUNCH_SWAPS,
            key as never,
            flag,
          );
          expect(swapped).toBe(
            appLaunchKey(ns as keyof typeof APP_LAUNCH_SWAPS, key as never, flag) !==
              key,
          );
        }
      }
    }
  });
});

// ─── The catalogs agree with the list (one home for the rule, I4) ──────────

type Catalog = Record<string, unknown>;
const CATALOGS: [string, Catalog][] = [
  ['no', no as Catalog],
  ['en', en as Catalog],
];

function at(catalog: Catalog, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node != null && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      catalog,
    );
}

/** Every string under a value (a FAQ entry is `{ q, a }`). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value != null && typeof value === 'object') {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

/** Every dot path in a catalog whose last segment ends in `Launched`. */
function launchedPaths(node: unknown, prefix = ''): string[] {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return [];
  return Object.entries(node).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return k.endsWith('Launched') ? [path] : launchedPaths(v, path);
  });
}

const LISTED: { ns: string; key: string; sibling: string }[] = Object.entries(
  APP_LAUNCH_SWAPS,
).flatMap(([ns, keys]) =>
  Object.keys(keys).map((key) => ({
    ns,
    key,
    sibling: `${ns}.${launchedSibling(key)}`,
  })),
);

// Claims that there is no app. A question («Må vi laste ned en app?») is not a
// claim, so strings ending in «?» are skipped.
const NO_APP_CLAIMS = [
  /ingen app/i,
  /uten app/i,
  /laste ned en app/i,
  /\bno app\b/i,
  /without an app/i,
];

describe.each(CATALOGS)('messages/%s.json', (_locale, catalog) => {
  it.each(LISTED)(
    'has the sibling $sibling',
    ({ ns, key, sibling }) => {
      expect(at(catalog, `${ns}.${key}`)).toBeDefined();
      expect(strings(at(catalog, sibling)).length).toBeGreaterThan(0);
    },
  );

  it('has no Launched key that the list does not know', () => {
    const listed = new Set(LISTED.map((l) => l.sibling));
    expect(launchedPaths(catalog).filter((p) => !listed.has(p))).toEqual([]);
  });

  it('no Launched text says there is no app', () => {
    const offenders = LISTED.flatMap(({ sibling }) =>
      strings(at(catalog, sibling))
        .filter((s) => !s.trim().endsWith('?'))
        .filter((s) => NO_APP_CLAIMS.some((re) => re.test(s)))
        .map((s) => `${sibling}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  // An index in the list («faq.2») points at the entry about the app. If the
  // entries are reordered, this fails before the wrong answer is swapped.
  // Named keys cannot drift that way, so only index keys are checked.
  it('every listed list entry is about the app, the browser or the demo', () => {
    const offTopic = LISTED.filter(
      ({ ns, key }) =>
        /\.\d+(\.|$)/.test(key) &&
        !strings(at(catalog, `${ns}.${key}`)).some((s) =>
          /app|demo|nettleser|browser|prøv|try|install/i.test(s),
        ),
    ).map(({ ns, key }) => `${ns}.${key}`);
    expect(offTopic).toEqual([]);
  });
});
