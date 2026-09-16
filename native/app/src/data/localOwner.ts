// native/app/src/data/localOwner.ts
// Native #1942: eier-vakten ved innlogging — lag 2 av lokal-data-hygienen.
//
// Webbens regel (#1404, som stammer fra #819: én brukers data skal aldri nå den
// neste på samme telefon) har to lag. Lag 1 er utloggingen (`logout.ts`):
// drain best-effort, tøm kun når køen er tom. Lag 2 er denne fila: logger en
// ANNEN bruker inn, tømmes forrige brukers rester FØR sync-motoren får gjort
// sin første drain.
//
// **Hvorfor laget må finnes.** Utloggingen lar med vilje uleverte slag ligge
// igjen når spilleren velger «Logg ut likevel». Logger så B inn på samme
// telefon, bryr ikke `drainQueue` seg om hvem som eier kø-radene: den kaller
// `upsert_score_if_newer` med A sin `p_user_id` under B sitt JWT, RLS avviser,
// `isPermanentSyncError` sier permanent, og etter fem forsøk karanteneres
// radene for godt — A sine slag er tapt, også etter at A logger inn igjen.
// Vakten her gjør at de radene aldri når drainen: basen er tom når B sin
// stack monteres.
//
// **Regelen, tre utfall:**
//
//   ingen lagret eier      → stemple, ikke tøm  (første innlogging etter oppdatering)
//   samme eier             → ingenting
//   annen eier             → tøm, DERETTER stemple
//
// Tømmingen skjer før stemplingen med vilje: kaster wipen, står stempelet
// fortsatt på forrige eier, og neste oppstart prøver igjen. Motsatt rekkefølge
// ville skrevet B som eier over A sine rester og latt dem ligge for godt.
//
// **Stempelet røres ikke ved utlogging.** Webben fjerner sitt når køen var tom;
// her får det stå. De tre utfallene over dekker alt uansett: samme bruker
// tilbake → ingenting, ny bruker → tøm (en alt tom base er ufarlig å tømme).
// Færre steder som skriver nøkkelen, færre steder å ta feil.
//
// Kjernen tar lageret som parametre, som webbens `ensureLocalDataOwner`: da
// testes beslutningen mot en base i minnet, og bindingen mot AsyncStorage
// nederst er tynn nok til å lese seg til.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wipeLocalData } from './db';
import { setOwnerWipeBlocked } from './ownerWipeBlock';

/**
 * AsyncStorage-nøkkelen stempelet bor under. `torny:`-prefikset holder den
 * unna supabase-js sine egne nøkler i det samme lageret.
 */
export const LOCAL_DATA_OWNER_KEY = 'torny:local-data-owner';

export type OwnerChange = 'first' | 'same' | 'switched';

/**
 * Hva innloggingen betyr for den lokale basen.
 *
 * En tom streng leses som «ingen eier»: AsyncStorage svarer `null` for en
 * nøkkel som mangler, men et stempel som av en eller annen grunn er tomt skal
 * heller gi et nytt stempel enn en wipe av data som kan være brukerens egne.
 */
export function detectOwnerChange(
  storedOwnerId: string | null,
  userId: string,
): OwnerChange {
  if (!storedOwnerId) return 'first';
  return storedOwnerId === userId ? 'same' : 'switched';
}

/**
 * #1959: wipen kastet ved eierbytte. Forrige brukers kø ligger fortsatt i
 * basen, så kalleren skal holde sync-motoren AV. Alle andre feil fra vakten er
 * fortsatt fail-open. Kastes bare ved `switched`; ved `first`/`same` tømmes
 * ingenting, og da finnes det ingenting å beskytte.
 */
export class OwnerWipeFailedError extends Error {
  constructor(cause: unknown) {
    super('Eierbytte: lokal wipe feilet', { cause });
    this.name = 'OwnerWipeFailedError';
  }
}

/** Lageret vakten trenger. Bindingen nederst fyller det med AsyncStorage + sqlite. */
export interface OwnerStore {
  getStoredOwnerId: () => Promise<string | null>;
  setStoredOwnerId: (userId: string) => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * Sørg for at den lokale basen tilhører `userId` — tøm den hvis den ikke gjør det.
 *
 * Kalles av `App.tsx` i det sesjonen er kjent, og stacken (og dermed
 * `startSyncTriggers`) monteres ikke før løftet er avgjort. Det er hele
 * garantien: ingen drain rekker å kjøre mot en base som tilhører noen andre.
 */
export async function ensureLocalDataOwner(
  userId: string,
  store: OwnerStore,
): Promise<OwnerChange> {
  const change = detectOwnerChange(await store.getStoredOwnerId(), userId);
  if (change === 'switched') {
    // Tøm FØR stemplingen — se fil-kommentaren.
    try {
      await store.clear();
    } catch (err) {
      throw new OwnerWipeFailedError(err);
    }
  }
  if (change !== 'same') await store.setStoredOwnerId(userId);
  return change;
}

// --- Enhets-binding (tynn, systemgrense) -----------------------------------

const deviceStore: OwnerStore = {
  getStoredOwnerId: () => AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY),
  setStoredOwnerId: (userId) => AsyncStorage.setItem(LOCAL_DATA_OWNER_KEY, userId),
  // Tømmer alle fire tabellene, også `cache_entries` — den globale
  // hjem-cachen (`HOME_CACHE_KEY`) ryker dermed med, og B ser aldri A sine kort.
  // Pil-funksjon, ikke referansen: bindingen leser `wipeLocalData` ved kall,
  // så testen kan la akkurat én wipe kaste.
  clear: () => wipeLocalData(),
};

/** Vakten mot enhetens eget lager. Se {@link ensureLocalDataOwner}. */
export async function ensureLocalDataOwnerOnDevice(userId: string): Promise<OwnerChange> {
  try {
    const change = await ensureLocalDataOwner(userId, deviceStore);
    setOwnerWipeBlocked(false);
    return change;
  } catch (err) {
    // #1959: sperr drainen for alle kallere, ikke bare triggerne i Hjem.
    // Andre feil lar sperren stå som den sto.
    if (err instanceof OwnerWipeFailedError) setOwnerWipeBlocked(true);
    throw err;
  }
}
