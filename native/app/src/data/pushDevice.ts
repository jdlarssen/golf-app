// #2256 PR 4, #2758: «Varsler på denne telefonen» — enhetens token i
// `apns_tokens` på iPhone og `fcm_tokens` på Android, så serveren (`notify` →
// `sendPushToUser`) kan varsle telefonen.
//
// **Samme vei som webbens iOS-skall** (`registerApnsToken` i
// app/[locale]/profile/apnsActions.ts): `upsert` på `token` med kallerens
// egen klient, og `expectOneOrClaim` (lib/supabase/claimFallback.ts). Tilhører
// tokenet en annen konto på samme telefon, avviser RLS med 42501, og
// `claim_apns_token` / `claim_fcm_token` flytter raden når kalleren viser fram
// selve tokenet (0166, 0167, 0232).
//
// **Det rå tokenet** (`getDevicePushTokenAsync`), ikke Expos push-token: vi
// sender selv, uten Expos push-tjeneste.
//
// **Tokenet huskes i AsyncStorage** (`PUSH_TOKEN_KEY`), telefonens ene hjem for
// innstillinger (PR 2), sammen med kontoen raden står på. Skjermen viser «På»
// bare for den kontoen, og utloggingen vet hvilken rad den skal slette. Husker
// telefonen et token for en annen konto (utloggingen nådde ikke basen, eller
// sesjonen døde uten utlogging), rydder neste innlogging raden
// (`settlePushOwner`), så forrige konto ikke får varsler hit.
//
// **Et bygg uten den native delen** (fra før modulen kom inn) viser ingen
// varsel-seksjon. `expo-notifications` laster flere native moduler med
// `requireNativeModule`, som kaster når de mangler, så vi spør først
// (`requireOptionalNativeModule` svarer `null`) og laster pakken bare når de
// finnes. Samme lærdom som kalenderen (#2255) og delingen (PR 3).
//
// **Tokenet følges opp** (#2758): ved oppstart skrives raden på nytt når varsler
// står på, og lytteren fanger et nytt token. Ellers ville bryteren stått på «På»
// uten at noe kom, etter at serveren ryddet raden eller telefonen fikk nytt token.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { expectOneOrClaim } from '../../../../lib/supabase/claimFallback';
import { PROFILE_TEXT } from '../lib/profileCopy';
import { currentDeviceUserId, supabase } from '../supabase';

export const PUSH_TOKEN_KEY = 'torny-push-token';

/** Kanalen på Android. Samme navn som `channel_id` i lib/notifications/push/fcm.ts. */
const ANDROID_CHANNEL_ID = 'varsler';

/** De native delene pakken laster når den importeres. */
const NATIVE_PARTS = [
  'ExpoPushTokenManager',
  'ExpoNotificationPermissionsModule',
  'ExpoNotificationsEmitter',
  'ExpoNotificationsHandlerModule',
] as const;

/** Kan denne telefonen få varsler fra Tørny? iPhone eller Android, og et bygg med modulen. */
export function canUsePush(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  try {
    return NATIVE_PARTS.every((name) => Boolean(requireOptionalNativeModule(name)));
  } catch {
    return false;
  }
}

/** Pakken, lastet først når de native delene finnes (se toppen av fila). */
export function notificationsModule(): typeof import('expo-notifications') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lastes bare når modulen finnes
  return require('expo-notifications') as typeof import('expo-notifications');
}

/** Tabellen tokenet hører hjemme i på denne telefonen. */
function tokenTable(): 'apns_tokens' | 'fcm_tokens' {
  return Platform.OS === 'android' ? 'fcm_tokens' : 'apns_tokens';
}

/** Flytter raden med dette tokenet til den som er logget inn. */
function claimToken(token: string, agent: string) {
  return supabase.rpc(Platform.OS === 'android' ? 'claim_fcm_token' : 'claim_apns_token', {
    p_token: token,
    p_user_agent: agent,
  });
}

/**
 * Oppretter kanalen på Android, som må finnes før tillatelsen og det første
 * varselet. Trygg å kalle flere ganger. Best-effort, kaster aldri: uten kanalen
 * legger Android varselet i sin egen reservekanal.
 */
export async function ensurePushChannel(): Promise<void> {
  if (Platform.OS !== 'android' || !canUsePush()) return;
  try {
    const notifications = notificationsModule();
    await notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: PROFILE_TEXT.notificationsHeading,
      importance: notifications.AndroidImportance.HIGH,
    });
  } catch (err) {
    console.error('[pushDevice] fikk ikke opprettet kanalen', err);
  }
}

/** Det telefonen husker: tokenet, og kontoen raden i tabellen står på. */
type StoredPush = { userId: string; token: string };

async function storedPush(): Promise<StoredPush | null> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPush> | null;
    return typeof parsed?.userId === 'string' && typeof parsed.token === 'string'
      ? { userId: parsed.userId, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

async function forgetStoredToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch (err) {
    console.error('[pushDevice] fikk ikke glemt tokenet lokalt', err);
  }
}

/**
 * Det skjermen viser: `unsupported` (ingen seksjon), `denied` (telefonen har
 * sagt nei, bare Innstillinger kan snu det), `on` eller `off`.
 */
export type PushState = 'unsupported' | 'denied' | 'on' | 'off';

export async function readPushState(): Promise<PushState> {
  if (!canUsePush()) return 'unsupported';
  try {
    const permission = await notificationsModule().getPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) return 'denied';
      // Android: tillatelsen kan tas bort i Innstillinger etter ja. Tokenet er
      // fortsatt husket, men ingenting vises, så bryteren står ikke på «På».
      if (Platform.OS === 'android') return 'off';
    }
  } catch (err) {
    console.error('[pushDevice] fikk ikke lest tillatelsen', err);
  }
  const stored = await storedPush();
  if (!stored) return 'off';
  // Et token husket for en annen konto er ikke denne kontoens varsler.
  return stored.userId === (await currentDeviceUserId()) ? 'on' : 'off';
}

export type PushResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'declined' | 'denied' | 'signed-out' | 'failed' };

/** Hvem som sendte tokenet, som i skallet: nok til å kjenne igjen raden. */
function userAgent(): string {
  const os = Platform.OS === 'android' ? 'Android' : 'iOS';
  return `Tørny-appen ${os} ${String(Platform.Version)}`.slice(0, 400);
}

/** Raden i tabellen, og så husket lokalt. */
async function saveToken(userId: string, token: string, context: string): Promise<void> {
  const agent = userAgent();
  await expectOneOrClaim(
    await supabase
      .from(tokenTable())
      .upsert({ user_id: userId, token, user_agent: agent }, { onConflict: 'token' })
      .select(),
    context,
    () => claimToken(token, agent),
  );
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, JSON.stringify({ userId, token } satisfies StoredPush));
}

/**
 * «Slå på»: tillatelse, tokenet, raden i tabellen, og så husket lokalt. Et nei
 * som kan spørres om igjen er `declined` (Android, første nei eller et sveip bort
 * fra dialogen), og et nei for godt er `denied`.
 */
export async function turnOnPush(): Promise<PushResult> {
  if (!canUsePush()) return { ok: false, reason: 'unsupported' };
  try {
    await ensurePushChannel();
    const notifications = notificationsModule();
    const permission = await notifications.requestPermissionsAsync();
    if (!permission.granted) {
      return { ok: false, reason: permission.canAskAgain ? 'declined' : 'denied' };
    }

    const userId = await currentDeviceUserId();
    if (!userId) return { ok: false, reason: 'signed-out' };

    const { data: token } = await notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'failed' };

    await saveToken(userId, token, 'turnOnPush');
    return { ok: true };
  } catch (err) {
    console.error('[pushDevice] fikk ikke slått på varsler', err);
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Slett telefonens rad for kontoen den står på. `deleted` når basen tok bort
 * raden, `none` når den svarte uten rad (senderen kan ha ryddet den etter en
 * 410 fra Apple eller UNREGISTERED fra Google), `failed` ellers. Uten den kontoens sesjon kan ingenting
 * slettes (RLS), og svaret er `failed`.
 */
async function deleteRow(stored: StoredPush): Promise<'deleted' | 'none' | 'failed'> {
  if ((await currentDeviceUserId()) !== stored.userId) return 'failed';
  const { data, error } = await supabase
    .from(tokenTable())
    .delete()
    .eq('token', stored.token)
    .eq('user_id', stored.userId)
    .select('id');
  if (error) {
    console.error('[pushDevice] fikk ikke slettet raden', error);
    return 'failed';
  }
  return data && data.length > 0 ? 'deleted' : 'none';
}

/** «Slå av»: raden slettes før tokenet glemmes, så bryteren aldri lyver. */
export async function turnOffPush(): Promise<PushResult> {
  const stored = await storedPush();
  if (!stored) return { ok: true };
  try {
    if ((await deleteRow(stored)) === 'failed') return { ok: false, reason: 'failed' };
  } catch (err) {
    console.error('[pushDevice] fikk ikke slått av varsler', err);
    return { ok: false, reason: 'failed' };
  }
  await forgetStoredToken();
  return { ok: true };
}

/**
 * Utlogging: slett raden mens sesjonen ennå lever (RLS krever den).
 *
 * Tokenet glemmes når basen har svart for kontoen: raden er slettet, eller
 * den var alt borte (senderen rydder døde tokens). Ellers (uten
 * nett, eller sesjonen døde på veien) huskes det med kontoen, og neste
 * innlogging rydder raden (`settlePushOwner`). Logger den samme kontoen inn
 * igjen, står varslene fortsatt på, som bryteren viser. Best-effort, kaster
 * aldri. Utloggingen setter et tak på ventetiden (`logout.ts`).
 */
export async function forgetPushBeforeSignOut(): Promise<void> {
  const stored = await storedPush();
  if (!stored) return;
  try {
    if ((await deleteRow(stored)) !== 'failed') await forgetStoredToken();
  } catch (err) {
    console.error('[pushDevice] fikk ikke slettet raden ved utlogging', err);
  }
}

/**
 * Ved innlogging: husker telefonen et token for en ANNEN konto, får den kontoen
 * fortsatt varsler hit. Telefonen viser fram tokenet (RPC-en flytter raden til
 * den som er logget inn), og så slettes raden. Den nye
 * kontoen starter med varsler av. Best-effort og kaster aldri; feiler det,
 * prøves det igjen ved neste innlogging.
 */
export async function settlePushOwner(): Promise<void> {
  const stored = await storedPush();
  if (!stored) return;
  try {
    const userId = await currentDeviceUserId();
    if (!userId || userId === stored.userId) return;
    const { error } = await claimToken(stored.token, userAgent());
    if (error) throw error;
    if ((await deleteRow({ userId, token: stored.token })) !== 'failed') await forgetStoredToken();
  } catch (err) {
    console.error('[pushDevice] fikk ikke ryddet forrige kontos varsler', err);
  }
}

/**
 * Skriver raden for tokenet når varsler står på for kontoen som er logget inn.
 * Et husket token for en annen konto er `settlePushOwner` sin sak. Har tokenet
 * skiftet, slettes den gamle raden etterpå, så serveren ikke sender dit.
 */
async function keepTokenCurrent(token: string): Promise<void> {
  const stored = await storedPush();
  if (!stored) return;
  const userId = await currentDeviceUserId();
  if (!userId || userId !== stored.userId) return;
  await saveToken(userId, token, 'syncPushToken');
  if (stored.token !== token) await deleteRow(stored);
}

/**
 * Ved oppstart: står varsler på, skrives raden på nytt med tokenet telefonen har
 * nå. Dekker et nytt token og en rad serveren har ryddet. Gjør ingenting når
 * varsler er av. Best-effort, kaster aldri; neste oppstart prøver igjen.
 */
export async function syncPushToken(): Promise<void> {
  if (!canUsePush()) return;
  try {
    if (!(await storedPush())) return;
    const notifications = notificationsModule();
    const permission = await notifications.getPermissionsAsync();
    if (!permission.granted) return;
    const { data: token } = await notifications.getDevicePushTokenAsync();
    if (typeof token === 'string' && token.length > 0) await keepTokenCurrent(token);
  } catch (err) {
    console.error('[pushDevice] fikk ikke oppdatert tokenet', err);
  }
}

/** Fanger et nytt token mens appen er åpen. Svarer med en funksjon som stopper lytteren. Kaster aldri. */
export function listenForPushTokenChanges(): () => void {
  if (!canUsePush()) return () => {};
  try {
    const subscription = notificationsModule().addPushTokenListener(({ data }) => {
      if (typeof data !== 'string' || data.length === 0) return;
      keepTokenCurrent(data).catch((err) => {
        console.error('[pushDevice] fikk ikke oppdatert tokenet', err);
      });
    });
    return () => subscription.remove();
  } catch (err) {
    console.error('[pushDevice] fikk ikke startet token-lytteren', err);
    return () => {};
  }
}
