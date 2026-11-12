// #2841: appvelgeren på Android viser ikke innholdet mens låsen er på.
//
// Den native delen er `modules/recents-screenshot` (`Activity.setRecentsScreenshotEnabled`,
// API 33+). Modulen finnes bare på Android og bare i bygg som har den; på iOS, i jest og
// i et eldre bygg er den `null`, og kallet gjør ingenting. På Android under API 33 svarer
// modulen `false`, og appvelgeren viser innholdet som før.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type RecentsScreenshotModule = {
  setEnabled: (enabled: boolean) => boolean;
};

/**
 * `false` skrur av bildet systemet tar til appvelgeren, `true` slår det på igjen.
 * Svarer om kallet ble gjort. Kaster aldri.
 */
export function setRecentsScreenshotEnabled(enabled: boolean): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    const native = requireOptionalNativeModule<RecentsScreenshotModule>('RecentsScreenshot');
    return native?.setEnabled(enabled) ?? false;
  } catch (err) {
    console.error('[recentsScreenshot] kallet feilet', err);
    return false;
  }
}
