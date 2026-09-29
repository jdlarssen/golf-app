// #2256: temavalget — «Lys», «Mørk» eller «Følg telefonen» (standard).
//
// **Én bryter for hele appen.** `Appearance.setColorScheme` overstyrer det
// `useColorScheme()` svarer, så `useTheme()`, navigasjonens tema og
// statuslinja (`style="auto"`) følger med uten en linje kode hver. «Følg
// telefonen» er `'unspecified'`, verdien som slipper systemet til igjen
// (`react-native/Libraries/Utilities/Appearance.d.ts`, RN 0.86).
//
// **Valget hører til telefonen, ikke kontoen.** Det ligger i
// `device_settings`, som `wipeLocalData` ikke rører: logger du ut, står
// appen fortsatt i drakten du valgte.
//
// **Før første tegning.** `App.tsx` venter på {@link applyStoredThemePreference}
// bak splashen, så appen aldri blinker i feil drakt ved oppstart. Funksjonen
// kaster aldri: kan valget ikke leses, følger appen telefonen.
import { Appearance } from 'react-native';
import { getDb, getDeviceSetting, putDeviceSetting } from '../data/db';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Rekkefølgen valgene står i på skjermen. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Nøkkelen i `device_settings`. */
export const THEME_SETTING_KEY = 'theme';

/** En lagret verdi → valget. Alt ukjent (og ingenting) er «Følg telefonen». */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** Valget → det `Appearance.setColorScheme` tar. */
export function colorSchemeFor(preference: ThemePreference): 'light' | 'dark' | 'unspecified' {
  return preference === 'system' ? 'unspecified' : preference;
}

/** Det lagrede valget. Kaster når basen ikke kan leses. */
export async function loadThemePreference(): Promise<ThemePreference> {
  return parseThemePreference(await getDeviceSetting(await getDb(), THEME_SETTING_KEY));
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
    await putDeviceSetting(await getDb(), THEME_SETTING_KEY, preference);
    return true;
  } catch (err: unknown) {
    console.error('[themePreference] fikk ikke lagret temavalget', err);
    return false;
  }
}
