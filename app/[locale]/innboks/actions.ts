'use server';

import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { markNotificationsRead } from '@/lib/notifications/markRead';
import { archiveNotifications } from '@/lib/notifications/archive';
import { getServerClient } from '@/lib/supabase/server';

/**
 * Marker ett spesifikt varsel som lest. Caller (InboxClient) sender alltid
 * notification-id-en til den raden brukeren tappet — vi rør IKKE entityId
 * eller kind her, så et tap på «invite for Hauger Open» markerer bare det
 * ene varselet (ikke alle invite-varsler for det spillet).
 *
 * UserId hentes via proxy-header, ikke fra klienten — sikkerhetshygiene
 * (klienten kan ikke be om å markere noen andres varsler).
 */
export async function markOneAsRead(notificationId: string): Promise<void> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return;
  await markNotificationsRead({ userId, notificationId });
}

/**
 * Marker alle uleste varsler for current user som lest. Brukes fra
 * «Marker alle som lest»-knappen øverst i /innboks.
 */
export async function markAllAsRead(): Promise<void> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return;
  await markNotificationsRead({ userId });
}

/**
 * Arkiver ett spesifikt varsel (✕-knapp per kort, #616). Soft-archive:
 * raden skjules fra lista men slettes ikke. Setter også `read_at` så en
 * arkivert-mens-ulest rad ikke etterlater en hengende bunn-nav-prikk.
 *
 * UserId hentes via proxy-header, ikke fra klienten — klienten kan ikke be
 * om å arkivere noen andres varsler.
 */
export async function archiveOne(notificationId: string): Promise<void> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return;
  await archiveNotifications({ userId, notificationId });
}

/**
 * Arkiver alle LESTE varsler for current user («Tøm leste»-knapp, #616).
 * Uleste røres ikke — de blir stående til brukeren leser eller arkiverer dem.
 */
export async function clearRead(): Promise<void> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return;
  await archiveNotifications({ userId });
}

/**
 * Skru månedsbrevet (product-updates, #202) på eller av. Eierskapet flyttet
 * hit fra profil-skjemaet (#401) siden det er en varsel-innstilling, ikke en
 * golfprofil-greie. `null` = på (default), timestamp = av-meldt da.
 */
export async function toggleProductUpdates(optIn: boolean): Promise<void> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return;
  const supabase = await getServerClient();
  await supabase
    .from('users')
    .update({
      product_updates_unsubscribed_at: optIn ? null : new Date().toISOString(),
    })
    .eq('id', userId);
}
