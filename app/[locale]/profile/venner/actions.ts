'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import {
  addByEmail,
  remove,
  respond,
  sendRequest,
} from '@/lib/friends/friendActionsCore';
import type { AppLocale } from '@/i18n/routing';

// Skallene rundt vennehandlingene (#2256): de leser skjemaet, sjekker
// innloggingen og gjør statusen om til en redirect. Selve handlingen (RPC-en,
// varselet, avsenderoppslaget) bor i `lib/friends/friendActionsCore.ts`, som
// appens serverruter under `app/api/friends/` også kaller.

const VENNER = '/profile/venner';

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
  const status = await sendRequest(supabase, user.id, addresseeId);
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
  const status = await addByEmail(supabase, user.id, email);
  if (status === 'not_found') {
    // Personen er ikke på Tørny — tilby invitasjon på samme e-post.
    redirect({ href: `${VENNER}?invite_email=${encodeURIComponent(email)}`, locale });
    return;
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
  const status = await respond(supabase, user.id, requestId, accept);
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
  const status = await remove(supabase, otherId);
  redirect({ href: `${VENNER}?status=${status}`, locale });
}
