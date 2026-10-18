'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useStorePlatform } from '@/hooks/useStorePlatform';
import {
  appBannerStores,
  appLaunchFlag,
  isAppLaunched,
} from '@/lib/app/appLaunch';
import type { Store } from '@/lib/app/storeLinks';
import { StoreBadges } from '@/components/app/StoreBadges';
import { InstallInstructionsModal } from './InstallInstructionsModal';

const DISMISS_KEY = 'torny-install-banner-dismissed';
const DISMISS_EVENT = 'torny-install-banner-change';

// #1186 — value-first timing (contract trigger (a)): give value before you ask.
// A pure client-side counter of logged-in Home visits, no server plumbing.
// The banner stays hidden on the very first Home visit and only appears from
// the 2nd visit on, mirroring PushNudge's "ask after value" philosophy. This is
// an additive AND gate — the standalone/dismiss/anti-flash logic is unchanged.
const VISITS_KEY = 'torny-home-visits';
const BANNER_MIN_VISIT = 2; // first shown on the 2nd logged-in Home visit

const subscribe = (cb: () => void) => {
  window.addEventListener(DISMISS_EVENT, cb);
  return () => window.removeEventListener(DISMISS_EVENT, cb);
};
const getSnapshot = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};
// SSR + first hydration render return `true` so the banner doesn't flash
// before localStorage is read. After hydration React switches to getSnapshot.
const getServerSnapshot = () => true;

// Visit store (#1186). Read the Home-visit count the same reactive way as the
// dismiss flag so the reveal survives the increment below without setState.
const VISITS_EVENT = 'torny-home-visits-change';
const visitSubscribe = (cb: () => void) => {
  window.addEventListener(VISITS_EVENT, cb);
  return () => window.removeEventListener(VISITS_EVENT, cb);
};
const getVisitSnapshot = () => {
  try {
    return (Number(localStorage.getItem(VISITS_KEY)) || 0) >= BANNER_MIN_VISIT;
  } catch {
    return true; // storage blocked (private mode) — fail open, show as before
  }
};
// SSR + first hydration render return `false` (hidden) so the banner never
// flashes before the client-side visit count is read.
const getVisitServerSnapshot = () => false;

/**
 * Visit gate (#1186), shared by both banners. Reads the Home-visit count
 * reactively so the banner reveals after the increment fires, with no SSR
 * flash, and counts this mount as one visit.
 */
function useHomeVisitGate(): boolean {
  const passedVisitGate = useSyncExternalStore(
    visitSubscribe,
    getVisitSnapshot,
    getVisitServerSnapshot,
  );
  const countedRef = useRef(false);

  useEffect(() => {
    // Count this mount as one Home visit. Guard against React StrictMode's
    // double-invoked effect (dev/staging run `next dev`) so a single mount is
    // exactly one visit. Only touches localStorage + notifies the visit store —
    // no setState here; the store read above drives the reveal.
    if (countedRef.current) return;
    countedRef.current = true;
    try {
      const priorVisits = Number(localStorage.getItem(VISITS_KEY)) || 0;
      localStorage.setItem(VISITS_KEY, String(priorVisits + 1));
    } catch {
      // Storage unavailable (private mode) — getVisitSnapshot fails open instead.
    }
    window.dispatchEvent(new Event(VISITS_EVENT));
  }, []);

  return passedVisitGate;
}

type BannerProps = {
  /** #1797: nudge-køen (HomeNudgeRail) styrer hvilken plass som faktisk vises. */
  visible: boolean;
  /** Meldes når kvalifiseringen er avklart — og på nytt om den endrer seg. */
  onVerdict: (qualified: boolean) => void;
};

/**
 * The home-screen banner's slot on Hjem (#1797). Once the app is out (#2562,
 * owner's answer 2) the slot shows «Hent Tørny-appen» with the store badges
 * where the app is (`appBannerStores`: with `ios` iPhone/iPad, with `on`
 * everyone), and the banner that adds Tørny to the home screen elsewhere.
 * With the switch off it is the home-screen banner, as before. The platform
 * is known only after hydration, so until then the slot stays pending.
 */
export function InstallBanner(props: BannerProps) {
  const platform = useStorePlatform();
  const flag = appLaunchFlag();
  if (!isAppLaunched(flag)) return <HomeScreenBanner {...props} />;
  if (platform === 'unknown') return null;
  const stores = appBannerStores(flag, platform);
  return stores.length > 0 ? (
    <AppBanner {...props} stores={stores} />
  ) : (
    <HomeScreenBanner {...props} />
  );
}

function HomeScreenBanner({ visible, onVerdict }: BannerProps) {
  const t = useTranslations('installBanner');
  const { status, install } = useInstallPrompt();
  const dismissed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const passedVisitGate = useHomeVisitGate();
  const [modalOpen, setModalOpen] = useState(false);

  const qualified =
    status !== 'loading' &&
    status !== 'standalone' &&
    !dismissed &&
    passedVisitGate;

  useEffect(() => {
    // 'loading' = miljøet er uavklart — hold køens plass på 'pending' så
    // ingen lavere nudge vises på en gjetning (#1797).
    if (status === 'loading') return;
    onVerdict(qualified);
  }, [status, qualified, onVerdict]);

  if (!visible) return null; // #1797: en annen nudge holder plassen
  if (!qualified) return null; // loading/standalone/dismissed/visit gate (#1186)

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage unavailable (private mode) — banner re-appears next load.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  async function onInstall() {
    if (status === 'native') {
      await install();
      // After a native attempt the deferred prompt is consumed regardless
      // of accept/decline, so hide the banner — user has answered.
      dismiss();
    } else {
      setModalOpen(true);
    }
  }

  const modalVariant =
    status === 'ios-safari'
      ? 'ios-safari'
      : status === 'ios-other'
        ? 'ios-other'
        : 'unsupported';

  return (
    <>
      <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-text">
            {t('title')}
          </p>
          <p className="text-xs text-text mt-0.5 leading-relaxed">
            {t('body')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onInstall}
            className="rounded-full bg-primary text-bg-tint dark:text-bg px-3 py-1.5 text-xs font-medium min-h-11"
          >
            {t('install')}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('closeAria')}
            className="text-text px-1.5 py-1 min-h-11 min-w-11 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      </div>
      <InstallInstructionsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        variant={modalVariant}
      />
    </>
  );
}

// ─── «Hent Tørny-appen» (#2562) ────────────────────────────────────────────
// Its own dismiss key: someone who closed «Installer» once still sees the app
// once. Shown in an installed PWA too, since that is where the app replaces
// something; the visit gate is the same as the home-screen banner's.
const APP_DISMISS_KEY = 'torny-get-app-banner-dismissed';
const APP_DISMISS_EVENT = 'torny-get-app-banner-change';

const appSubscribe = (cb: () => void) => {
  window.addEventListener(APP_DISMISS_EVENT, cb);
  return () => window.removeEventListener(APP_DISMISS_EVENT, cb);
};
const getAppSnapshot = () => {
  try {
    return localStorage.getItem(APP_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

function AppBanner({
  visible,
  onVerdict,
  stores,
}: BannerProps & { stores: Store[] }) {
  const t = useTranslations('installBanner');
  const dismissed = useSyncExternalStore(
    appSubscribe,
    getAppSnapshot,
    getServerSnapshot,
  );
  const passedVisitGate = useHomeVisitGate();
  const qualified = !dismissed && passedVisitGate;

  useEffect(() => {
    onVerdict(qualified);
  }, [qualified, onVerdict]);

  if (!visible || !qualified) return null;

  function dismiss() {
    try {
      localStorage.setItem(APP_DISMISS_KEY, '1');
    } catch {
      // Storage unavailable (private mode) — banner re-appears next load.
    }
    window.dispatchEvent(new Event(APP_DISMISS_EVENT));
  }

  return (
    <div
      data-testid="get-app-banner"
      className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 flex items-start gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-text">{t('appTitle')}</p>
        <p className="text-xs text-text mt-0.5 leading-relaxed">
          {t('appBody')}
        </p>
        <StoreBadges stores={stores} className="mt-1.5" />
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('closeAria')}
        className="text-text px-1.5 py-1 min-h-11 min-w-11 flex items-center justify-center shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
