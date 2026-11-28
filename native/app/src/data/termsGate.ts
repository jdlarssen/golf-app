// native/app/src/data/termsGate.ts
// #3019: avgjørelsen bak `TermsGate` — skal vilkårsspørsmålet vises? Samme
// form som `aiConsentGate.ts`: spørsmålet kommer én gang per versjon, og
// porten slipper spilleren inn ved tvil (uten nett, treg lesing, lesefeil),
// så ingen oppstart venter på nettet. Spørsmålet kommer da neste gang appen
// starter med nett.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync } from 'expo-network';
import { TERMS_VERSION } from '../../../../lib/legal/terms';
import { fetchTermsAccepted } from './terms';

export const TERMS_READ_TIMEOUT_MS = 5_000;

const KEY_PREFIX = 'torny:terms-accepted:';
const keyFor = (userId: string) => `${KEY_PREFIX}v${TERMS_VERSION}:${userId}`;

/** Husk at denne brukeren har godtatt denne versjonen. Kaster aldri. */
export async function rememberTermsAccepted(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), '1');
  } catch (err) {
    console.error('[termsGate] kunne ikke huske svaret', err);
  }
}

/** Glem alle svar enheten husker (kontoen slettes, `data/account.ts`). Kaster aldri. */
export async function forgetTermsAnswers(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
    if (keys.length > 0) await AsyncStorage.removeMany(keys);
  } catch (err) {
    console.error('[termsGate] kunne ikke glemme svarene', err);
  }
}

async function remembered(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) === '1';
  } catch {
    return false;
  }
}

async function deviceOffline(): Promise<boolean> {
  try {
    return (await getNetworkStateAsync()).isConnected === false;
  } catch {
    return false;
  }
}

/** `true` når spørsmålet skal vises, ellers `false`. Kaster aldri. */
export async function termsStepFor(
  userId: string,
  { timeoutMs = TERMS_READ_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<boolean> {
  if (await remembered(userId)) return false;
  if (await deviceOffline()) return false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const read = fetchTermsAccepted(userId).catch((err: unknown) => {
    console.error('[termsGate] svaret kunne ikke leses', err);
    return 'failed' as const;
  });
  const result = await Promise.race([read, timeout]);
  clearTimeout(timer);

  if (result === 'timeout' || result === 'failed') return false;
  if (result) {
    await rememberTermsAccepted(userId);
    return false;
  }
  return true;
}
