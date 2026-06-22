'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import {
  THEME_PREFERENCES,
  type ThemePreference,
  applyThemePreference,
  readStoredThemePreference,
  storeThemePreference,
} from '@/lib/theme/themePreference';

// Egen event så endringer i denne komponenten oppdaterer snapshot-en
// umiddelbart (samme mønster som InstallBanner). `storage`-eventen dekker
// kryss-fane-synk, men fyrer ikke i fanen som skrev verdien.
const THEME_CHANGE_EVENT = 'torny-theme-change';

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

const getSnapshot = (): ThemePreference => readStoredThemePreference();
// Server kjenner ikke localStorage → 'auto' både ved SSR og første
// klient-render, så hydration matcher. Etter mount leser snapshot-en det
// faktiske valget.
const getServerSnapshot = (): ThemePreference => 'auto';

/**
 * Segmentert Auto / Lys / Mørk-velger for Profil-siden. Samme pille-stil som
 * {@link LocaleSwitcher} så de to konfig-radene leser likt.
 *
 * - «Auto» fjerner override-en og følger OS (`prefers-color-scheme`).
 * - «Lys» / «Mørk» setter `data-theme` på <html> og lagres i localStorage.
 *
 * CSS-kontrakten ligger i `app/globals.css`; all DOM-/storage-logikk i
 * `lib/theme/themePreference.ts`. Komponenten leser valget via
 * useSyncExternalStore (ingen setState-i-effect, ingen hydration-mismatch).
 */
export function ThemeSwitcher() {
  const t = useTranslations('profile.theme');
  const preference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  function select(next: ThemePreference) {
    applyThemePreference(next);
    storeThemePreference(next);
    // Skriv så snapshot-en re-leses (storage-eventen fyrer ikke lokalt).
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('groupLabel')}
      data-testid="theme-switcher"
      className="inline-flex overflow-hidden rounded-full border border-border bg-surface shadow-sm"
    >
      {THEME_PREFERENCES.map((option) => {
        const isActive = option === preference;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-testid={`theme-option-${option}`}
            onClick={() => select(option)}
            className={`flex min-h-[44px] min-w-[56px] items-center justify-center px-3 font-sans text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 first:rounded-l-full last:rounded-r-full ${
              isActive
                ? 'bg-primary text-bg'
                : 'text-muted hover:bg-primary-soft/60 hover:text-text'
            }`}
          >
            {t(`options.${option}`)}
          </button>
        );
      })}
    </div>
  );
}
