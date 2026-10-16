// native/app/src/data/aiConsentGate.ts
// #2561 PR B: avgjørelsen bak `AiConsentGate` — skal spørsmålet om AI-tekster
// vises? Samme form som `profileGate.ts`.
//
// Spørsmålet kommer én gang, når spilleren ikke har svart. Porten slipper
// spilleren inn ved enhver tvil, og ingen oppstart skal vente på nettet unødig.
// Det er trygt fordi navnet bare går til AI-en med «ja» (`lib/ai/consent.ts`):
// en spiller som slipper forbi uten å ha svart, står ikke med navn i noen tekst.
//
// - **Husket svar.** Har enheten sett et svar for denne brukeren, leses det
//   ikke igjen. Bryteren i «Personvern og konto» endrer svaret senere.
// - **Ekte nettstatus.** `getNetworkStateAsync` spør telefonen nå, som i
//   `profileGate.ts`.
// - **Tak på lesingen.** Henger lesingen, slipper porten spilleren inn, og
//   spørsmålet kommer neste gang appen starter med nett.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync } from 'expo-network';
import { fetchOwnAiConsent } from './aiConsent';

/** Hvor lenge porten venter på svaret før den slipper spilleren inn. */
export const AI_CONSENT_READ_TIMEOUT_MS = 5_000;

const KEY_PREFIX = 'torny:ai-consent-answered:';

/** Husk at denne brukeren har svart. Kaster aldri. */
export async function rememberAiConsentAnswered(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${KEY_PREFIX}${userId}`, '1');
  } catch (err) {
    console.error('[aiConsentGate] kunne ikke huske svaret', err);
  }
}

async function rememberedAnswered(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(`${KEY_PREFIX}${userId}`)) === '1';
  } catch {
    return false;
  }
}

async function deviceOffline(): Promise<boolean> {
  try {
    const state = await getNetworkStateAsync();
    return state.isConnected === false;
  } catch {
    return false;
  }
}

/** `true` når spørsmålet skal vises, ellers `false` (porten slipper inn). Kaster aldri. */
export async function aiConsentStepFor(
  userId: string,
  { timeoutMs = AI_CONSENT_READ_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<boolean> {
  if (await rememberedAnswered(userId)) return false;
  if (await deviceOffline()) return false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const read = fetchOwnAiConsent(userId).catch((err: unknown) => {
    console.error('[aiConsentGate] svaret kunne ikke leses', err);
    return 'failed' as const;
  });
  const result = await Promise.race([read, timeout]);
  clearTimeout(timer);

  if (result === 'timeout' || result === 'failed') return false;
  if (result !== null) {
    await rememberAiConsentAnswered(userId);
    return false;
  }
  return true;
}
