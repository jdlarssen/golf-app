'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import type { AppLocale } from '@/i18n/routing';

const VENNER = '/profile/venner';

/**
 * Visningsnavn for varsel-payload: nickname-dekorert navn → e-post.
 * Returnerer null (ikke norsk fallback) når vi ikke finner brukeren — render-
 * tid fallback i NotificationCard bruker katalog-strengen i riktig locale.
 */
async function getDisplayName(userId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('users')
    .select('name, nickname, email')
    .eq('id', userId)
    .maybeSingle<{ name: string | null; nickname: string | null; email: string }>();
  if (!data) return null;
  const base = data.name?.trim() || data.email;
  return data.nickname ? `${base} «${data.nickname}»` : base;
}

/** Best-effort venne-varsel. Aldri blokker bruker-flyten. */
async function notifyFriend(
  targetId: string,
  kind: 'friend_request' | 'friend_accepted',
  actorId: string,
): Promise<void> {
  try {
    const actorName = await getDisplayName(actorId);
    await notify({
      userId: targetId,
      kind,
      // actor_name may be null — NotificationCard renders the catalog fallback
      // at render time in the correct locale (§4 payload-fallback contract).
      payload: { actor_id: actorId, actor_name: actorName },
    });
  } catch (err) {
    console.error('[venner] notify failed', err);
  }
}

/**
 * Map RPC-status → varsel som skal sendes til target. 'requested' →
 * mottaker får friend_request; 'accepted' (omvendt pending ble godtatt) →
 * den opprinnelige avsenderen får friend_accepted.
 */
async function notifyForStatus(
  status: string,
  targetId: string,
  actorId: string,
): Promise<void> {
  if (status === 'requested') {
    await notifyFriend(targetId, 'friend_request', actorId);
  } else if (status === 'accepted') {
    await notifyFriend(targetId, 'friend_accepted', actorId);
  }
}

async function requireUser() {
  const locale = (await getLocale()) as AppLocale;
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: `/login?next=${VENNER}`, locale });
    return { supabase, user: null as never, locale };
  }
  return { supabase, user, locale };
}

/**
 * Send venneforespørsel til en kjent bruker-id (fra co-player-forslag).
 */
export async function sendFriendRequest(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const addresseeId = String(formData.get('addressee_id') ?? '').trim();
  if (!addresseeId) {
    redirect({ href: `${VENNER}?status=error`, locale });
    return;
  }

  const { supabase, user } = await requireUser();
  const { data: status, error } = await supabase.rpc('send_friend_request', {
    p_addressee: addresseeId,
  });
  if (error) {
    console.error('[venner] send_friend_request failed', error);
    redirect({ href: `${VENNER}?status=error`, locale });
    return;
  }

  await notifyForStatus(String(status), addresseeId, user.id);
  redirect({ href: `${VENNER}?status=${status}`, locale });
}

/**
 * Legg til venn på e-post. Finnes brukeren → forespørsel. Ukjent e-post →
 * redirect med invite_email så siden tilbyr å invitere på samme adresse.
 */
export async function addFriendByEmail(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email) {
    redirect({ href: `${VENNER}?status=email_required`, locale });
    return;
  }

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc('send_friend_request_by_email', {
    p_email: email,
  });
  if (error) {
    console.error('[venner] send_friend_request_by_email failed', error);
    redirect({ href: `${VENNER}?status=error`, locale });
    return;
  }

  const result = (data ?? {}) as { status?: string; target_id?: string | null };
  const status = result.status ?? 'error';

  if (status === 'not_found') {
    // Personen er ikke på Tørny — tilby invitasjon på samme e-post.
    redirect({ href: `${VENNER}?invite_email=${encodeURIComponent(email)}`, locale });
    return;
  }
  if (result.target_id) {
    await notifyForStatus(status, result.target_id, user.id);
  }
  redirect({ href: `${VENNER}?status=${status}`, locale });
}

/**
 * Godta eller avslå en innkommende forespørsel. Ved godkjenning varsles
 * avsenderen (friend_accepted).
 */
export async function respondFriendRequest(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const requestId = String(formData.get('request_id') ?? '').trim();
  const accept = String(formData.get('accept') ?? '') === '1';
  if (!requestId) {
    redirect({ href: `${VENNER}?status=error`, locale });
    return;
  }

  const { supabase, user } = await requireUser();

  // Hent avsender-id før avgjørelsen (raden slettes ved avslag).
  const admin = getAdminClient();
  const { data: row } = await admin
    .from('friendships')
    .select('requester_id')
    .eq('id', requestId)
    .maybeSingle<{ requester_id: string }>();

  const { data: status, error } = await supabase.rpc('respond_friend_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) {
    console.error('[venner] respond_friend_request failed', error);
    redirect({ href: `${VENNER}?status=error`, locale });
    return;
  }

  if (status === 'accepted' && row?.requester_id) {
    await notifyFriend(row.requester_id, 'friend_accepted', user.id);
  }
  redirect({ href: `${VENNER}?status=${status}`, locale });
}

/**
 * Fjern en venn ELLER trekk tilbake en utgående/innkommende forespørsel.
 * Ingen varsel — fjerning er stille.
 */
export async function removeFriend(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const otherId = String(formData.get('other_id') ?? '').trim();
  if (!otherId) {
    redirect({ href: `${VENNER}?status=error`, locale });
    return;
  }

  const { supabase } = await requireUser();
  const { data: status, error } = await supabase.rpc('remove_friend', {
    p_other: otherId,
  });
  if (error) {
    console.error('[venner] remove_friend failed', error);
    redirect({ href: `${VENNER}?status=error`, locale });
    return;
  }
  redirect({ href: `${VENNER}?status=${status}`, locale });
}
