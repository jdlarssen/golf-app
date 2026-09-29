// #2256: temavalget — «Lys», «Mørk» eller «Følg telefonen» (standard).
//
// **Én bryter for hele appen.** `Appearance.setColorScheme` overstyrer det
// `useColorScheme()` svarer, så `useTheme()`, navigasjonens tema og
// statuslinja (`style="auto"`) følger med uten en linje kode hver. «Følg
// telefonen» er `'unspecified'`, verdien som slipper systemet til igjen
// (`react-native/Libraries/Utilities/Appearance.d.ts`, RN 0.86).
//
// **Valget hører til telefonen, ikke kontoen.** Det ligger i AsyncStorage,
// samme hjem som sollys og putter, som `wipeLocalData` ikke rører: logger du
// ut, står appen fortsatt i drakten du valgte. #2256 PR 1 lagret det i SQLite
// (`device_settings`); en telefon som fikk den versjonen, får valget flyttet
// hit én gang (`takeLegacyDeviceSetting`).
//
// **Før første tegning.** `App.tsx` venter på {@link applyStoredThemePreference}
// bak splashen, så appen aldri blinker i feil drakt ved oppstart. Funksjonen
// kaster aldri: kan valget ikke leses, følger appen telefonen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { getDb, takeLegacyDeviceSetting } from '../data/db';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Rekkefølgen valgene står i på skjermen. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Nøkkelen i AsyncStorage. */
export const THEME_STORAGE_KEY = 'torny-theme';

/** Nøkkelen valget hadde i `device_settings` (#2256 PR 1). */
const LEGACY_THEME_KEY = 'theme';

/** En lagret verdi → valget. Alt ukjent (og ingenting) er «Følg telefonen». */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** Valget → det `Appearance.setColorScheme` tar. */
export function colorSchemeFor(preference: ThemePreference): 'light' | 'dark' | 'unspecified' {
  return preference === 'system' ? 'unspecified' : preference;
}

/**
 * Det lagrede valget. Kaster når AsyncStorage ikke kan leses.
 *
 * Står det et valg i AsyncStorage, vinner det alltid. Bare når det mangler,
 * spør vi etter en verdi fra v3-tabellen, og den skrives hit én gang.
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
  if (stored != null) return parseThemePreference(stored);

  const legacy = await readLegacyTheme();
  if (legacy === undefined) return 'system';
  const preference = parseThemePreference(legacy);
  await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
  return preference;
}

/** Valget fra v3-tabellen, som leses når basen åpnes. Feil gir `undefined`. */
async function readLegacyTheme(): Promise<string | undefined> {
  try {
    await getDb();
  } catch (err: unknown) {
    console.error('[themePreference] fikk ikke åpnet basen for å flytte temavalget', err);
    return undefined;
  }
  return takeLegacyDeviceSetting(LEGACY_THEME_KEY);
}

/** Les valget og slå det på. Kaster aldri; en feil gir «Følg telefonen». */
export async function applyStoredThemePreference(): Promise<ThemePreference> {
  let preference: ThemePreference = 'system';
  try {
    preference = await loadThemePreference();
  } catch (err: unknown) {
    console.error('[themePreference] fikk ikke lest temavalget', err);
  }
  Appearance.setColorScheme(colorSchemeFor(preference));
  return preference;
}

/**
 * Slå på et nytt valg med én gang, og lagre det til neste oppstart.
 *
 * @returns `false` når lagringen feilet. Valget gjelder likevel til appen
 *   lukkes, og skjermen sier fra.
 */
export async function saveThemePreference(preference: ThemePreference): Promise<boolean> {
  Appearance.setColorScheme(colorSchemeFor(preference));
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch (err: unknown) {
    console.error('[themePreference] fikk ikke lagret temavalget', err);
    return false;
  }
}
