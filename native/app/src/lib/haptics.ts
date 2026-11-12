// native/app/src/lib/haptics.ts
// #2840: det lille dunket når en venns skive lander i laget. `expo-haptics` er en
// native modul (kontrakt v3, endring 6), så et bygg uten den, eller en telefon uten
// vibrasjon, skal bare la være: dunket er pynt, aldri en feil spilleren ser.
import { ImpactFeedbackStyle, impactAsync } from 'expo-haptics';

/** Et lett dunk. Gjør ingenting når telefonen ikke kan. Kaster aldri. */
export function landingTap(): void {
  try {
    void impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // Ingen native modul i dette bygget.
  }
}
