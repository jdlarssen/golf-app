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
// innstillinger (PR 2), så skjermen vet at denne telefonen er på, og
// utloggingen vet hvilken rad den skal slette.
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

async function storedToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
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
  return (await storedToken()) ? 'on' : 'off';
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
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return { ok: true };
  } catch (err) {
    console.error('[pushDevice] fikk ikke slått på varsler', err);
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Slett denne telefonens rad for kontoen. `true` når basen svarte uten feil;
 * 0 rader er også riktig (senderen kan ha ryddet raden etter en 410).
 */
async function deleteRow(token: string): Promise<boolean> {
  const userId = await currentDeviceUserId();
  if (!userId) return true;
  const { error } = await supabase
    .from('apns_tokens')
    .delete()
    .eq('token', token)
    .eq('user_id', userId);
  if (error) {
    console.error('[pushDevice] fikk ikke slettet raden', error);
    return false;
  }
  return true;
}

/** «Slå av»: raden slettes før tokenet glemmes, så bryteren aldri lyver. */
export async function turnOffPush(): Promise<PushResult> {
  const token = await storedToken();
  if (!token) return { ok: true };
  try {
    if (!(await deleteRow(token))) return { ok: false, reason: 'failed' };
  } catch (err) {
    console.error('[pushDevice] fikk ikke slått av varsler', err);
    return { ok: false, reason: 'failed' };
  }
  await forgetStoredToken();
  return { ok: true };
}

/**
 * Utlogging: slett raden mens sesjonen ennå lever (RLS krever den), og glem
 * tokenet lokalt uansett, så neste konto på telefonen starter med varsler av.
 * Best-effort, kaster aldri. Feiler slettingen uten nett, står raden til
 * senderen får en 410 og rydder den, og det logges her.
 */
export async function forgetPushBeforeSignOut(): Promise<void> {
  const token = await storedToken();
  if (!token) return;
  try {
    await deleteRow(token);
  } catch (err) {
    console.error('[pushDevice] fikk ikke slettet raden ved utlogging', err);
  }
  await forgetStoredToken();
}
