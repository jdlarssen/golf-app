// #2256: temavalget — «Lys», «Mørk» eller «Følg telefonen». Type A.
//
// Valget lagres i `device_settings` (ekte SQL via sqlite-mocken) og slås på
// med `Appearance.setColorScheme`, som overstyrer `useColorScheme()` for hele
// appen. Spionen på `setColorScheme` er grensen mot RN: testen sjekker hva
// appen ber om, ikke hvordan iOS tegner det.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

type ThemePreferenceModule = typeof import('./themePreference');
type Db = typeof import('../data/db');
type RN = typeof import('react-native');

function subject(): ThemePreferenceModule {
  return require('./themePreference') as ThemePreferenceModule;
}

function db(): Db {
  return require('../data/db') as Db;
}

/** Spionen settes på modulinstansen koden under test ser (etter resetModules). */
function spyOnSetColorScheme(): jest.SpyInstance {
  const { Appearance } = require('react-native') as RN;
  return jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
}

describe('themePreference', () => {
  useFreshModules();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
    [undefined, 'system'],
    ['blå', 'system'],
  ] as const)('reads a stored %p as %p', (raw, expected) => {
    expect(subject().parseThemePreference(raw)).toBe(expected);
  });

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'unspecified'],
  ] as const)('asks RN for %p as %p', (preference, scheme) => {
    expect(subject().colorSchemeFor(preference)).toBe(scheme);
  });

  it('follows the phone when nothing is stored', async () => {
    const setColorScheme = spyOnSetColorScheme();

    expect(await subject().applyStoredThemePreference()).toBe('system');
    expect(setColorScheme).toHaveBeenCalledWith('unspecified');
  });

  it('applies the stored choice at start', async () => {
    const { getDb, putDeviceSetting } = db();
    await putDeviceSetting(await getDb(), subject().THEME_SETTING_KEY, 'dark');
    const setColorScheme = spyOnSetColorScheme();

    expect(await subject().applyStoredThemePreference()).toBe('dark');
    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('applies a new choice at once and keeps it for the next start', async () => {
    const setColorScheme = spyOnSetColorScheme();

    expect(await subject().saveThemePreference('light')).toBe(true);
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
    expect(await subject().loadThemePreference()).toBe('light');
  });

  it('keeps the choice through a log-out wipe', async () => {
    spyOnSetColorScheme();
    await subject().saveThemePreference('dark');

    await db().wipeLocalData();

    expect(await subject().loadThemePreference()).toBe('dark');
  });

  it('still applies the choice when it cannot be stored, and says so', async () => {
    const setColorScheme = spyOnSetColorScheme();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(db(), 'getDb').mockRejectedValue(new Error('disk full'));

    expect(await subject().saveThemePreference('dark')).toBe(false);
    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('never keeps the app from starting when the setting cannot be read', async () => {
    const setColorScheme = spyOnSetColorScheme();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(db(), 'getDb').mockRejectedValue(new Error('locked'));

    expect(await subject().applyStoredThemePreference()).toBe('system');
    expect(setColorScheme).toHaveBeenCalledWith('unspecified');
  });
});
