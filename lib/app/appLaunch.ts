import { STORE_URLS, type Store } from './storeLinks';
import type { DevicePlatform } from '@/lib/pwa/detect';

/**
 * The website's switch for release day (#2562). `NEXT_PUBLIC_APP_LAUNCH`
 * follows the `NEXT_PUBLIC_PASSKEYS` pattern (`lib/auth/passkeyFlag.ts`):
 *
 * - `off` (default, also unset or unknown): the website is exactly as before.
 * - `ios`: the app is in the App Store, not yet in Google Play. The «no app»
 *   texts are swapped and «Hent appen» shows the App Store only. Android
 *   phones get no card. The demo buttons stay as they are.
 * - `on`: both stores. The demo buttons become «Hent appen», and `/demo`
 *   points to the app instead of running the demo round.
 *
 * `NEXT_PUBLIC_*` is baked in at build, so switching means setting the
 * variable in Vercel and deploying again (`docs/native/app-store-release.md`,
 * «Nettsiden samme dag»).
 */
export type AppLaunchFlag = 'off' | 'ios' | 'on';

/** The device's store platform; `unknown` on the server and first render. */
export type StorePlatform = DevicePlatform | 'unknown';

/** Normalise the raw env value to a known flag; anything else is `off`. */
export function parseAppLaunch(raw: string | undefined | null): AppLaunchFlag {
  return raw === 'on' ? 'on' : raw === 'ios' ? 'ios' : 'off';
}

/** The flag for this build. Reads the variable on each call (tests stub it). */
export function appLaunchFlag(): AppLaunchFlag {
  return parseAppLaunch(process.env.NEXT_PUBLIC_APP_LAUNCH);
}

export function isAppLaunched(flag: AppLaunchFlag): boolean {
  return flag !== 'off';
}

/**
 * The store badges «Hent appen» shows on a device. The server render and a PC
 * get every store that is out; an iPhone or an Android phone gets its own.
 * With `ios`, an Android phone gets none, so the card is not shown at all.
 */
export function storesFor(flag: AppLaunchFlag, platform: StorePlatform): Store[] {
  switch (flag) {
    case 'off':
      return [];
    case 'ios':
      return platform === 'android' ? [] : ['appStore'];
    case 'on':
      if (platform === 'ios') return ['appStore'];
      if (platform === 'android') return ['googlePlay'];
      return ['appStore', 'googlePlay'];
  }
}

/**
 * Where a «Hent appen» button goes once the page knows the device (owner's
 * answer 1). `null` keeps `/demo`, which with `on` is the page with both
 * badges: that is a PC, the server render, and every state but `on`.
 */
export function deviceStoreUrl(
  flag: AppLaunchFlag,
  platform: StorePlatform,
): string | null {
  if (flag !== 'on') return null;
  if (platform === 'ios') return STORE_URLS.appStore;
  if (platform === 'android') return STORE_URLS.googlePlay;
  return null;
}

/**
 * The home-screen banner becomes «Hent appen» where the app is out (owner's
 * answer 2): with `ios` on iPhone/iPad, with `on` everywhere. `[]` keeps the
 * banner that adds Tørny to the home screen. No decision before the platform
 * is known.
 */
export function appBannerStores(
  flag: AppLaunchFlag,
  platform: StorePlatform,
): Store[] {
  if (platform === 'unknown') return [];
  if (flag === 'ios' && platform !== 'ios') return [];
  return storesFor(flag, platform);
}

// ─── The texts that are swapped ─────────────────────────────────────────────

/**
 * When a key is swapped: `launched` with `ios` and `on`, `on` only with `on`
 * (the demo buttons and the texts around them, since `/demo` stops running
 * the demo round only then).
 */
type SwapWhen = 'launched' | 'on';

/**
 * Every message key the switch swaps, per namespace. Each one has a sibling
 * in `messages/*.json` named by `launchedSibling` («hero.trust» →
 * «hero.trustLaunched», «faq.2» → «faq2Launched»). The old texts stay as
 * they are, so `off` renders the same strings as before. The catalog test
 * (`appLaunch.test.ts`) reads this list too.
 */
export const APP_LAUNCH_SWAPS = {
  landing: {
    'hero.trust': 'launched',
    'how.step2Body': 'launched',
    metaTitle: 'launched',
    'faq.2': 'launched',
    'hero.primaryCta': 'on',
    'endCta.secondaryCta': 'on',
    'footer.demo': 'on',
  },
  auth: {
    'sendCode.inviteHint': 'launched',
    tryDemo: 'on',
  },
  arrangeGuide: {
    'sections.2.body': 'launched',
    ctaBody: 'on',
    ctaPrimary: 'on',
  },
  whyTorny: {
    'faq.1': 'launched',
    'endCta.body': 'on',
    'endCta.primaryCta': 'on',
    'footer.demo': 'on',
  },
  formatGuide: {
    detailCtaBody: 'on',
    detailCtaButton: 'on',
  },
  demo: {
    pageTitle: 'on',
    metaDescription: 'on',
  },
} as const satisfies Record<string, Record<string, SwapWhen>>;

type Swaps = typeof APP_LAUNCH_SWAPS;
export type SwapNamespace = keyof Swaps;
export type SwapKey<N extends SwapNamespace> = keyof Swaps[N] & string;

/** «faq.2» → «faq2Launched», «sections.2.body» → «sections2BodyLaunched». */
export type LaunchedSibling<K extends string> =
  K extends `${infer A}.${infer D extends number}.${infer B}`
    ? `${A}${D}${Capitalize<B>}Launched`
    : K extends `${infer A}.${infer D extends number}`
      ? `${A}${D}Launched`
      : `${K}Launched`;

/** The sibling key that holds a swapped text (see `LaunchedSibling`). */
export function launchedSibling(key: string): string {
  return `${key.replace(/\.(\d+)(?:\.(\w))?/, (_m, index: string, next?: string) =>
    next ? `${index}${next.toUpperCase()}` : index,
  )}Launched`;
}

/** Is this listed key swapped under the flag? */
export function isLaunchSwap<N extends SwapNamespace>(
  ns: N,
  key: SwapKey<N>,
  flag: AppLaunchFlag,
): boolean {
  const when = (APP_LAUNCH_SWAPS[ns] as Record<string, SwapWhen>)[key];
  return when === 'on' ? flag === 'on' : isAppLaunched(flag);
}

/**
 * The key to translate: the old one, or its `Launched` sibling when the
 * switch says so. Pass the key relative to `ns`, as the namespaced `t` takes
 * it: `t(appLaunchKey('landing', 'hero.trust', flag))`.
 */
export function appLaunchKey<N extends SwapNamespace, K extends SwapKey<N>>(
  ns: N,
  key: K,
  flag: AppLaunchFlag,
): K | LaunchedSibling<K> {
  return isLaunchSwap(ns, key, flag)
    ? (launchedSibling(key) as LaunchedSibling<K>)
    : key;
}
