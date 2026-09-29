// #2256: temavalget — «Lys», «Mørk» eller «Følg telefonen». Type A.
//
// Valget lagres i AsyncStorage (pakkens egen jest-mock, et lager i minnet),
// som sollys og putter, og slås på med `Appearance.setColorScheme`, som
// overstyrer `useColorScheme()` for hele appen. Spionen på `setColorScheme` er
// grensen mot RN: testen sjekker hva appen ber om, ikke hvordan iOS tegner det.
// En telefon som sto på v3 kan ha valget i SQLite (`device_settings`); den
// overføres én gang, og den kjøres mot ekte SQL via sqlite-mocken.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

type ThemePreferenceModule = typeof import('./themePreference');
type Db = typeof import('../data/db');
type RN = typeof import('react-native');
type Storage = typeof import('@react-native-async-storage/async-storage').default;
type SqliteMock = typeof import('../test/sqliteMock');

function storage(): Storage {
  return (require('@react-native-async-storage/async-storage') as { default: Storage }).default;
}

/** En telefon som sto på v3 med `theme` lagret i `device_settings`. */
async function seedV3Theme(value: string): Promise<void> {
  const { DATABASE_NAME, MIGRATION_V1, MIGRATION_V2, MIGRATION_V3 } = db();
  const { openDatabaseAsync } = require('../test/sqliteMock') as SqliteMock;
  const existing = await openDatabaseAsync(DATABASE_NAME);
  await existing.execAsync(MIGRATION_V1);
  await existing.execAsync(MIGRATION_V2);
  await existing.execAsync(MIGRATION_V3);
  await existing.execAsync('PRAGMA user_version = 3;');
  await existing.runAsync(
    'INSERT INTO device_settings (key, value) VALUES ($key, $value);',
    { $key: 'theme', $value: value },
  );
}

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
    await storage().setItem(subject().THEME_STORAGE_KEY, 'dark');
    const setColorScheme = spyOnSetColorScheme();

    expect(await subject().applyStoredThemePreference()).toBe('dark');
    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('moves a choice from the v3 table to AsyncStorage once', async () => {
    await seedV3Theme('dark');
    const setColorScheme = spyOnSetColorScheme();

    expect(await subject().applyStoredThemePreference()).toBe('dark');
    expect(setColorScheme).toHaveBeenCalledWith('dark');
    expect(await storage().getItem(subject().THEME_STORAGE_KEY)).toBe('dark');
  });

  it('never lets the v3 value overwrite a choice already in AsyncStorage', async () => {
    await seedV3Theme('dark');
    await storage().setItem(subject().THEME_STORAGE_KEY, 'light');
    spyOnSetColorScheme();

    expect(await subject().loadThemePreference()).toBe('light');
    expect(await storage().getItem(subject().THEME_STORAGE_KEY)).toBe('light');
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
    jest.spyOn(storage(), 'setItem').mockRejectedValue(new Error('disk full'));

    expect(await subject().saveThemePreference('dark')).toBe(false);
    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('never keeps the app from starting when the setting cannot be read', async () => {
    const setColorScheme = spyOnSetColorScheme();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(storage(), 'getItem').mockRejectedValue(new Error('locked'));

    expect(await subject().applyStoredThemePreference()).toBe('system');
    expect(setColorScheme).toHaveBeenCalledWith('unspecified');
  });

  it('follows the phone when the old table cannot be read', async () => {
    const setColorScheme = spyOnSetColorScheme();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(db(), 'getDb').mockRejectedValue(new Error('locked'));

    expect(await subject().applyStoredThemePreference()).toBe('system');
    expect(setColorScheme).toHaveBeenCalledWith('unspecified');
  });
});
