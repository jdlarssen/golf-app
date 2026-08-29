'use client';

// Små, klient-lokale UI-tilstander på hull-flaten (#1716 — ren flytting ut av
// `HoleClient`): onboarding-hintet, putt-registrerings-bryteren og
// «lagret»-pulsen. Ingen av dem rører scores — de husker bare hva brukeren
// har sett eller slått på.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { formatTime } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';

export const ONBOARDING_KEY = 'torny-hole-hint-dismissed';

const SYNC_PULSE_MS = 700;

export type OnboardingHint = {
  visible: boolean;
  dismiss: () => void;
};

/**
 * Onboarding banner: visible only on hole 1, and only if not dismissed.
 * We track "dismissed" rather than "show" so we never assign state inside an
 * effect on subsequent renders — the visibility is purely derived.
 *
 * The lazy initializer reads localStorage synchronously to avoid a banner
 * flash on every page load. Trade-off: a returning user landing on hole 1
 * may see a one-paint banner-mismatch warning in dev (React rehydration).
 * Acceptable: the banner is only on hole 1 and dismisses on first interaction.
 */
export function useOnboardingHint(currentHole: number): OnboardingHint {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === '1';
    } catch {
      return false;
    }
  });

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // best effort
    }
  }

  return { visible: currentHole === 1 && !dismissed, dismiss };
}

export type PuttsTracking = {
  enabled: boolean;
  toggle: () => void;
};

/**
 * Putt-registrering opt-in (#939): per-runde-bryter persistert i localStorage,
 * per game. useSyncExternalStore holder SSR + første klient-paint enige
 * (server-snapshot = false), og leser localStorage på nytt etter hydrering —
 * ingen hydration-mismatch (samme mønster som ThemeSwitcher/InstallBanner).
 * Selve putts-dataen ligger i scores.putts; bryteren styrer bare synligheten.
 */
export function usePuttsTracking(gameId: string): PuttsTracking {
  const puttsTrackingKey = `torny:putts:${gameId}`;
  const subscribePutts = useCallback((onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener('torny:putts-change', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('torny:putts-change', onChange);
    };
  }, []);
  const enabled = useSyncExternalStore(
    subscribePutts,
    () => {
      try {
        return localStorage.getItem(puttsTrackingKey) === '1';
      } catch {
        return false;
      }
    },
    () => false,
  );

  function toggle() {
    try {
      const next = localStorage.getItem(puttsTrackingKey) === '1' ? '0' : '1';
      localStorage.setItem(puttsTrackingKey, next);
    } catch {
      // best effort
    }
    window.dispatchEvent(new Event('torny:putts-change'));
  }

  return { enabled, toggle };
}

export type SyncPulse = {
  syncing: boolean;
  savedAt: string;
  pulse: () => void;
};

/** Sync pulse — local-only signal "we wrote a score recently". */
export function useSyncPulse(locale: AppLocale): SyncPulse {
  const [syncing, setSyncing] = useState(false);
  const [savedAt, setSavedAt] = useState<string>('');
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  function pulse() {
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    setSyncing(true);
    pulseTimerRef.current = setTimeout(() => {
      setSyncing(false);
      setSavedAt(
        formatTime(new Date(), locale, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      pulseTimerRef.current = null;
    }, SYNC_PULSE_MS);
  }

  return { syncing, savedAt, pulse };
}
