import 'server-only';
import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  parseNotificationPayload,
  type NotificationKind,
  type NotificationPayload,
} from './types';

/**
 * Terskel for når brukeren regnes som «off-app» og dermed skal få mail
 * som backup på in-app varselet. 5 min er konservativt — dekker normal
 * idle/swap-mellom-apper-bruk uten å gi unødvendig mail-spam.
 *
 * Refleksjonen er beskrevet nærmere i design-doc-en til issue #25.
 */
export const OFF_APP_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Insert varsel + returner om mail bør sendes som backup. Caller er
 * ansvarlig for å trigge mail-sendingen — vi gjør ingen mail-IO her.
 *
 * Best-effort: feiler stille på DB-error (loggføres console.error).
 * Skal aldri blokkere parent-action som er en faktisk bruker-flyt.
 *
 * Cache-tag `notifications-${userId}` invalideres ved insert slik at
 * SSR-rendering av /innboks ikke serverer stale data. Bell-badgen
 * oppdateres via realtime, men direkte /innboks-navigering går gjennom
 * Next.js-cache.
 */
export async function notify<K extends NotificationKind>(opts: {
  userId: string;
  kind: K;
  payload: NotificationPayload<K>;
}): Promise<{ shouldAlsoSendMail: boolean }> {
  const { userId, kind, payload } = opts;

  // Validér payload mot zod-skjema før insert — bedre å feile tidlig
  // her enn å ha en korrupt JSONB-rad som /innboks ikke kan rendre.
  parseNotificationPayload(kind, payload);

  const admin = getAdminClient();

  // Insert + lookup last_seen_at i parallell. Insert er den autoritative
  // operasjonen; mail-gaten er informativ.
  const [insertRes, userRes] = await Promise.all([
    admin.from('notifications').insert({
      user_id: userId,
      kind,
      payload,
    }),
    admin
      .from('users')
      .select('last_seen_at')
      .eq('id', userId)
      .single<{ last_seen_at: string | null }>(),
  ]);

  if (insertRes.error) {
    console.error('[notifications] insert failed', insertRes.error);
    // Returner false så caller IKKE sender mail heller — vi vil ikke ha
    // en situasjon der mail går ut men in-app er tom (verre UX enn ingen).
    return { shouldAlsoSendMail: false };
  }

  // Invalider innboks-cache for brukeren.
  revalidateTag(`notifications-${userId}`);

  return {
    shouldAlsoSendMail: shouldSendMailFallback(userRes.data?.last_seen_at ?? null),
  };
}

/**
 * Pure helper for off-app-beregning. Eksportert for testing og for
 * direkte gjenbruk fra andre call-sites som vil styre mail-gating
 * uten å gå gjennom notify() (sjelden, men mulig).
 */
export function shouldSendMailFallback(lastSeenAt: string | null): boolean {
  if (lastSeenAt == null) return true;
  const ts = Date.parse(lastSeenAt);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > OFF_APP_THRESHOLD_MS;
}
