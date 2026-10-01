'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { displayNameForOthers } from '@/lib/users/displayName';

/**
 * connectFriend — «legg til meg»-lenkens server-action. Den innloggede som
 * åpner lenken kobles som venn med eieren (eieren inviterte ved å dele,
 * åpneren aksepterer ved å koble). Idempotent via connect_via_friend_code.
 */
export async function connectFriend(formData: FormData) {
  const locale = await getLocale();
  const code = String(formData.get('code') ?? '').trim();
  if (!code) {
    redirect({ href: '/profile/venner', locale });
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: `/login?next=/venner/legg-til/${code}`, locale });
  }

  const { data, error } = await supabase.rpc('connect_via_friend_code', {
    p_code: code,
  });
  if (error) {
    console.error('[venner] connect_via_friend_code failed', error);
    redirect({ href: `/venner/legg-til/${code}?error=1`, locale });
  }

  const result = (data ?? {}) as { owner_id?: string; status?: string };

  // Eieren (de delte lenken) varsles om at noen koblet seg på.
  if (result.status === 'connected' && result.owner_id) {
    try {
      const admin = getAdminClient();
      const { data: me } = await admin
        .from('users')
        .select('name, nickname, email')
        .eq('id', user.id)
        .maybeSingle<{ name: string | null; nickname: string | null; email: string }>();
      // actor_name may be null — NotificationCard renders the catalog fallback
      // at render time in the correct locale (§4 payload-fallback contract).
      const actorName = me ? displayNameForOthers(me) : null;
      await notify({
        userId: result.owner_id,
        kind: 'friend_accepted',
        // #2263: they used your friend link — the inbox says «la deg til som venn».
        payload: { actor_id: user.id, actor_name: actorName, via: 'link' },
      });
    } catch (err) {
      console.error('[venner] connect notify failed', err);
    }
  }

  const status = result.status === 'already_friends' ? 'already_friends' : 'accepted';
  redirect({ href: `/profile/venner?status=${status}`, locale });
}
