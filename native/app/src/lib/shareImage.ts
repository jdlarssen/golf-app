// #2256 PR 3: «Del bag-taggen» — et bilde av kortet og telefonens delearke.
// #2265 PR 2 deler den med «Del kortet» i Kavalkaden, derfor det generelle
// navnet.
//
// Det eneste stedet appen snakker med de to modulene (`react-native-view-shot`
// tar bildet, `expo-sharing` åpner arket), så skjermtestene kan mocke dem her.
//
// **Et bygg uten den native delen.** Et app-bygg fra før modulene kom inn, har
// dem ikke. `react-native-view-shot` kaller `TurboModuleRegistry.getEnforcing`
// allerede når pakken lastes, og det kaster, så en lat `require` ville krasjet
// appen (samme felle som kalenderen i #2255). Vi spør derfor først om begge
// native delene finnes (`TurboModuleRegistry.get` og
// `requireOptionalNativeModule` svarer `null` og kaster aldri), og laster
// pakkene bare når de gjør det. Uten dem vises ikke knappen i det hele tatt.
//
// **Avbrutt deling er ingen feil.** iOS løser løftet fra `shareAsync` både
// når spilleren deler og når arket lukkes (`SharingModule.swift`).
import { requireOptionalNativeModule } from 'expo';
import type { RefObject } from 'react';
import { NativeModules, TurboModuleRegistry, type View } from 'react-native';

/**
 * Finnes begge de native delene i dette bygget? View-shot slås opp nøyaktig
 * slik pakken selv gjør det (`specs/NativeRNViewShot.ts`): i TurboModule-
 * registeret når `__turboModuleProxy` finnes, ellers i `NativeModules`. Appen
 * kjører bridgeless, der `__turboModuleProxy` ikke settes, så der er det
 * `NativeModules` (som svarer `null` for en modul som mangler) som gjelder.
 */
export function canShareImage(): boolean {
  try {
    const newArchitecture = (globalThis as { __turboModuleProxy?: unknown }).__turboModuleProxy != null;
    const viewShot = newArchitecture
      ? TurboModuleRegistry.get('RNViewShot')
      : NativeModules.RNViewShot;
    return Boolean(viewShot) && Boolean(requireOptionalNativeModule('ExpoSharing'));
  } catch {
    return false;
  }
}

/** View-shot gir en ren sti; delingen vil ha en fil-URL. */
export function toFileUrl(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export type ShareImageResult = { ok: true } | { ok: false };

/** Ta bilde av kortet (PNG) og åpne delearket med det. Kaster aldri. */
export async function shareViewImage(card: RefObject<View | null>): Promise<ShareImageResult> {
  try {
    if (!canShareImage() || !card.current) return { ok: false };
    // Lat `require`, ikke `import()`: jest kjører ikke dynamisk import, og
    // pakkene skal bare lastes når de native delene finnes (over).
    /* eslint-disable @typescript-eslint/no-require-imports -- lastes ved trykk, se toppen av fila */
    const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
    const sharing = require('expo-sharing') as typeof import('expo-sharing');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const path = await captureRef(card, { format: 'png', result: 'tmpfile' });
    await sharing.shareAsync(toFileUrl(path), { UTI: 'public.png', mimeType: 'image/png' });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
