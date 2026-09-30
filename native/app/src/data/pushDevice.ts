// #2256 PR 4: «Varsler på denne telefonen» — enhetens APNs-token i
// `apns_tokens`, så serveren (`notify` → `sendPushToUser`) kan varsle
// telefonen.
//
// **Samme vei som webbens iOS-skall** (`registerApnsToken` i
// app/[locale]/profile/apnsActions.ts): `upsert` på `token` med kallerens
// egen klient, og `expectOneOrClaim` (lib/supabase/claimFallback.ts). Tilhører
// tokenet en annen konto på samme telefon, avviser RLS med 42501, og
// `claim_apns_token` flytter raden når kalleren viser fram selve tokenet. Ingen
// migrasjon: tabellen, policyene og RPC-en finnes (0166, 0167).
//
// **Det rå APNs-tokenet** (`getDevicePushTokenAsync`), ikke Expos push-token:
// vi sender selv, uten Expos push-tjeneste.
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
// **Bare iPhone** (eierens svar 2): serveren sender ikke til Android.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { expectOneOrClaim } from '../../../../lib/supabase/claimFallback';
import { currentDeviceUserId, supabase } from '../supabase';

export const PUSH_TOKEN_KEY = 'torny-push-token';

/** De native delene pakken laster når den importeres. */
const NATIVE_PARTS = [
  'ExpoPushTokenManager',
  'ExpoNotificationPermissionsModule',
  'ExpoNotificationsEmitter',
  'ExpoNotificationsHandlerModule',
] as const;

/** Kan denne telefonen få varsler fra Tørny? iPhone, og et bygg med modulen. */
export function canUsePush(): boolean {
  if (Platform.OS !== 'ios') return false;
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

/** Det telefonen husker: tokenet, og kontoen raden i `apns_tokens` står på. */
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
 * Det skjermen viser: `unsupported` (ingen seksjon), `denied` (iOS har sagt
 * nei, bare Innstillinger kan snu det), `on` eller `off`.
 */
export type PushState = 'unsupported' | 'denied' | 'on' | 'off';

export async function readPushState(): Promise<PushState> {
  if (!canUsePush()) return 'unsupported';
  try {
    const permission = await notificationsModule().getPermissionsAsync();
    if (!permission.granted && !permission.canAskAgain) return 'denied';
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
  | { ok: false; reason: 'unsupported' | 'denied' | 'signed-out' | 'failed' };

/** Hvem som sendte tokenet, som i skallet: nok til å kjenne igjen raden. */
function userAgent(): string {
  return `Tørny-appen iOS ${String(Platform.Version)}`.slice(0, 400);
}

/** «Slå på»: tillatelse, tokenet, raden i `apns_tokens`, og så husket lokalt. */
export async function turnOnPush(): Promise<PushResult> {
  if (!canUsePush()) return { ok: false, reason: 'unsupported' };
  try {
    const notifications = notificationsModule();
    const permission = await notifications.requestPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'denied' };

    const userId = await currentDeviceUserId();
    if (!userId) return { ok: false, reason: 'signed-out' };

    const { data: token } = await notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'failed' };

    const agent = userAgent();
    await expectOneOrClaim(
      await supabase
        .from('apns_tokens')
        .upsert({ user_id: userId, token, user_agent: agent }, { onConflict: 'token' })
        .select(),
      'turnOnPush',
      () => supabase.rpc('claim_apns_token', { p_token: token, p_user_agent: agent }),
    );
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, JSON.stringify({ userId, token } satisfies StoredPush));
    return { ok: true };
  } catch (err) {
    console.error('[pushDevice] fikk ikke slått på varsler', err);
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Slett telefonens rad for kontoen den står på. `deleted` når basen tok bort
 * raden, `none` når den svarte uten rad (senderen kan ha ryddet den etter en
 * 410 fra Apple), `failed` ellers. Uten den kontoens sesjon kan ingenting
 * slettes (RLS), og svaret er `failed`.
 */
async function deleteRow(stored: StoredPush): Promise<'deleted' | 'none' | 'failed'> {
  if ((await currentDeviceUserId()) !== stored.userId) return 'failed';
  const { data, error } = await supabase
    .from('apns_tokens')
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
 * den var alt borte (senderen rydder etter en 410 fra Apple). Ellers (uten
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
 * fortsatt varsler hit. Telefonen viser fram tokenet (`claim_apns_token`
 * flytter raden til den som er logget inn), og så slettes raden. Den nye
 * kontoen starter med varsler av. Best-effort og kaster aldri; feiler det,
 * prøves det igjen ved neste innlogging.
 */
export async function settlePushOwner(): Promise<void> {
  const stored = await storedPush();
  if (!stored) return;
  try {
    const userId = await currentDeviceUserId();
    if (!userId || userId === stored.userId) return;
    const { error } = await supabase.rpc('claim_apns_token', {
      p_token: stored.token,
      p_user_agent: userAgent(),
    });
    if (error) throw error;
    if ((await deleteRow({ userId, token: stored.token })) !== 'failed') await forgetStoredToken();
  } catch (err) {
    console.error('[pushDevice] fikk ikke ryddet forrige kontos varsler', err);
  }
}
