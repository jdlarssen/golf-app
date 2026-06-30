import { afterEach, describe, expect, it } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  isThemePreference,
  readStoredThemePreference,
  storeThemePreference,
  themeBootstrapScript,
} from './themePreference';

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('isThemePreference', () => {
  it.each(['auto', 'light', 'dark'])('accepts %s', (value) => {
    expect(isThemePreference(value)).toBe(true);
  });

  it.each([null, undefined, '', 'klubbhus-natt', 'AUTO', 42])(
    'rejects %s',
    (value) => {
      expect(isThemePreference(value)).toBe(false);
    },
  );
});

describe('applyThemePreference (CSS-kontrakt)', () => {
  it("'light' sets data-theme='light' so OS-mørk-spørringen blokkeres", () => {
    applyThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it("'dark' sets data-theme='dark' (tvinger mørk uansett OS)", () => {
    applyThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it("'auto' removes data-theme so the OS media query decides", () => {
    document.documentElement.dataset.theme = 'dark';
    applyThemePreference('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('switching back and forth leaves a clean attribute', () => {
    applyThemePreference('dark');
    applyThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyThemePreference('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('themeBootstrapScript (anti-FOUC, kjører før første paint)', () => {
  // Kjør den inline scripten slik nettleseren gjør under <head>-parsing.
  function runBootstrap() {
    new Function(themeBootstrapScript())();
  }

  it("restores a persisted 'dark' choice onto <html> on load", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runBootstrap();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it("restores a persisted 'light' choice onto <html> on load", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runBootstrap();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it("leaves <html> untouched for 'auto' (no key) so the OS query decides", () => {
    runBootstrap();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('ignores a corrupt stored value (follows OS rather than forcing)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    runBootstrap();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('storeThemePreference / readStoredThemePreference', () => {
  it('persists an explicit choice and reads it back', () => {
    storeThemePreference('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredThemePreference()).toBe('dark');
  });

  it("'auto' removes the stored key (no override persisted)", () => {
    storeThemePreference('light');
    storeThemePreference('auto');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('defaults to auto when nothing is stored', () => {
    expect(readStoredThemePreference()).toBe('auto');
  });

  it('falls back to auto when the stored value is corrupt', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readStoredThemePreference()).toBe('auto');
  });
});
