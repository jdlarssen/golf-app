'use server';

import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { markNotificationsRead } from '@/lib/notifications/markRead';

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
