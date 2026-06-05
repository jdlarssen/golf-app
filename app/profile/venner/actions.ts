'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';

const VENNER = '/profile/venner';

/**
 * Visningsnavn for varsel-payload: nickname-dekorert navn → e-post.
 * Best-effort fallback. Speiler getRequesterName i klubb-actions.
 */
async function getDisplayName(userId: string): Promise<string> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('users')
    .select('name, nickname, email')
    .eq('id', userId)
    .maybeSingle<{ name: string | null; nickname: string | null; email: string }>();
  if (!data) return 'En venn';
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
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${VENNER}`);
  }
  return { supabase, user };
}

/**
 * Send venneforespørsel til en kjent bruker-id (fra co-player-forslag).
 */
export async function sendFriendRequest(formData: FormData) {
  const addresseeId = String(formData.get('addressee_id') ?? '').trim();
  if (!addresseeId) redirect(`${VENNER}?status=error`);

  const { supabase, user } = await requireUser();
  const { data: status, error } = await supabase.rpc('send_friend_request', {
    p_addressee: addresseeId,
  });
  if (error) {
    console.error('[venner] send_friend_request failed', error);
    redirect(`${VENNER}?status=error`);
  }

  await notifyForStatus(String(status), addresseeId, user.id);
  redirect(`${VENNER}?status=${status}`);
}

/**
 * Legg til venn på e-post. Finnes brukeren → forespørsel. Ukjent e-post →
 * redirect med invite_email så siden tilbyr å invitere på samme adresse.
 */
export async function addFriendByEmail(formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email) redirect(`${VENNER}?status=email_required`);

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc('send_friend_request_by_email', {
    p_email: email,
  });
  if (error) {
    console.error('[venner] send_friend_request_by_email failed', error);
    redirect(`${VENNER}?status=error`);
  }

  const result = (data ?? {}) as { status?: string; target_id?: string | null };
  const status = result.status ?? 'error';

  if (status === 'not_found') {
    // Personen er ikke på Tørny — tilby invitasjon på samme e-post.
    redirect(`${VENNER}?invite_email=${encodeURIComponent(email)}`);
  }
  if (result.target_id) {
    await notifyForStatus(status, result.target_id, user.id);
  }
  redirect(`${VENNER}?status=${status}`);
}

/**
 * Godta eller avslå en innkommende forespørsel. Ved godkjenning varsles
 * avsenderen (friend_accepted).
 */
export async function respondFriendRequest(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '').trim();
  const accept = String(formData.get('accept') ?? '') === '1';
  if (!requestId) redirect(`${VENNER}?status=error`);

  const { supabase } = await requireUser();

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
    redirect(`${VENNER}?status=error`);
  }

  if (status === 'accepted' && row?.requester_id) {
    const { user } = await requireUser();
    await notifyFriend(row.requester_id, 'friend_accepted', user.id);
  }
  redirect(`${VENNER}?status=${status}`);
}

/**
 * Fjern en venn ELLER trekk tilbake en utgående/innkommende forespørsel.
 * Ingen varsel — fjerning er stille.
 */
export async function removeFriend(formData: FormData) {
  const otherId = String(formData.get('other_id') ?? '').trim();
  if (!otherId) redirect(`${VENNER}?status=error`);

  const { supabase } = await requireUser();
  const { data: status, error } = await supabase.rpc('remove_friend', {
    p_other: otherId,
  });
  if (error) {
    console.error('[venner] remove_friend failed', error);
    redirect(`${VENNER}?status=error`);
  }
  redirect(`${VENNER}?status=${status}`);
}
