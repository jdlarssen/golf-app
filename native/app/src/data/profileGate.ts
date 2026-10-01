// native/app/src/data/profileGate.ts
// #2216: avgjørelsen bak `ProfileGate` — skal «Fullfør profilen» vises?
//
// Regelen er nettsidens `/`: steget kommer når `profile_completed_at` mangler.
// Appen er offline-først, så porten slipper spilleren inn ved enhver tvil, og
// ingen oppstart skal vente på nettet unødig:
//
// - **Husket fullført.** Har enheten sett profilen fullført for denne brukeren,
//   leses den ikke igjen. Feltet blir aldri tomt igjen etter at det er satt
//   (nettsiden og `PUT /api/profile` setter det, ingenting nuller det).
// - **Ekte nettstatus.** `getNetworkStateAsync` spør telefonen nå. Sync-
//   triggernes `isDeviceOnline` starter som `true` og settes først når Hjem
//   har startet lytteren, altså bak porten.
// - **Tak på lesingen.** Henger lesingen (svak dekning, en token som fornyes),
//   slipper porten spilleren inn når taket er nådd.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync } from 'expo-network';
import { fetchOwnProfile, type OwnProfile } from './profile';

/** Hvor lenge porten venter på profilen før den slipper spilleren inn. */
export const PROFILE_READ_TIMEOUT_MS = 5_000;

const KEY_PREFIX = 'torny:profile-complete:';

/** Husk at denne brukerens profil er fullført. Kaster aldri. */
export async function rememberProfileComplete(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${KEY_PREFIX}${userId}`, '1');
  } catch (err) {
    console.error('[profileGate] kunne ikke huske fullført profil', err);
  }
}

async function rememberedComplete(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(`${KEY_PREFIX}${userId}`)) === '1';
  } catch {
    return false;
  }
}

async function deviceOffline(): Promise<boolean> {
  try {
    const state = await getNetworkStateAsync();
    // Som i `syncTriggers.ts`: ukjent leses som tilkoblet.
    return state.isConnected === false;
  } catch {
    return false;
  }
}

/**
 * Profilen når «Fullfør profilen» skal vises, ellers `null` (porten slipper
 * spilleren inn). Kaster aldri.
 */
export async function profileStepFor(
  userId: string,
  { timeoutMs = PROFILE_READ_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<OwnProfile | null> {
  if (await rememberedComplete(userId)) return null;
  if (await deviceOffline()) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const read = fetchOwnProfile(userId).catch((err: unknown) => {
    console.error('[profileGate] profilen kunne ikke leses', err);
    return 'failed' as const;
  });
  const result = await Promise.race([read, timeout]);
  clearTimeout(timer);

  if (result === 'timeout' || result === 'failed') return null;
  if (result.profileCompletedAt) {
    await rememberProfileComplete(userId);
    return null;
  }
  return result;
}
