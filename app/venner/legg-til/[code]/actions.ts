'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';

/**
 * connectFriend — «legg til meg»-lenkens server-action. Den innloggede som
 * åpner lenken kobles som venn med eieren (eieren inviterte ved å dele,
 * åpneren aksepterer ved å koble). Idempotent via connect_via_friend_code.
 */
export async function connectFriend(formData: FormData) {
  const code = String(formData.get('code') ?? '').trim();
  if (!code) redirect('/profile/venner');

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/venner/legg-til/${code}`);

  const { data, error } = await supabase.rpc('connect_via_friend_code', {
    p_code: code,
  });
  if (error) {
    console.error('[venner] connect_via_friend_code failed', error);
    redirect(`/venner/legg-til/${code}?error=1`);
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
      const base = me?.name?.trim() || me?.email || 'En venn';
      const actorName = me?.nickname ? `${base} «${me.nickname}»` : base;
      await notify({
        userId: result.owner_id,
        kind: 'friend_accepted',
        payload: { actor_id: user.id, actor_name: actorName },
      });
    } catch (err) {
      console.error('[venner] connect notify failed', err);
    }
  }

  const status = result.status === 'already_friends' ? 'already_friends' : 'accepted';
  redirect(`/profile/venner?status=${status}`);
}
