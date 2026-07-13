'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';

/**
 * Sjekk om PG-error er UNIQUE-violation (23505) eller inneholder "duplicate"
 * i meldingen. Speiler signup/[shortId]/actions.ts-mønsteret.
 */
function isDuplicateError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  return String(err.message ?? '')
    .toLowerCase()
    .includes('duplicate');
}

/**
 * Slå opp displayName for notify-payload. Bruker nickname → name → email
 * i prioritet. Best-effort: returnerer fallback "En bruker" hvis raden mangler.
 */
async function getRequesterName(userId: string): Promise<string> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('users')
    .select('name, nickname, email')
    .eq('id', userId)
    .maybeSingle<{
      name: string | null;
      nickname: string | null;
      email: string;
    }>();
  if (!data) return 'En bruker';
  const base = data.name?.trim() || data.email;
  return data.nickname ? `${base} «${data.nickname}»` : base;
}

/**
 * requestToJoin — server action for «Be om å bli med»-skjemaet på
 * /klubber/bli-med/[shortId].
 *
 * Flyt:
 *   1. Auth: henter session via request-scoped client.
 *   2. Resolv gruppe via admin-client (short_id → group row).
 *   3. Sjekk at brukeren ikke allerede er medlem → redirect til /klubber/[id].
 *   4. INSERT group_join_requests (status=pending) via request-scoped client
 *      (RLS-policy «group_join_requests self insert pending» tillater dette).
 *      UNIQUE-conflict → vennlig «allerede sendt»-redirect.
 *   5. Best-effort notify til alle owner/admin i klubben.
 *   6. Redirect til /klubber/bli-med/[shortId]?sent=1.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function requestToJoin(formData: FormData) {
  const shortId = String(formData.get('shortId') ?? '').trim();

  const locale = await getLocale();

  if (!shortId) redirect({ href: '/klubber', locale });

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: `/login?next=/klubber/bli-med/${shortId}`, locale });
  }

  const admin = getAdminClient();

  // Resolve group by short_id — use admin client since non-member can't read groups via RLS.
  const { data: group } = await admin
    .from('groups')
    .select('id, name')
    .eq('short_id', shortId)
    .maybeSingle<{ id: string; name: string }>();

  if (!group) redirect({ href: '/klubber', locale });

  // Check if already a member — redirect to club page.
  const { data: existingMembership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', group!.id)
    .eq('user_id', user!.id)
    .maybeSingle();

  if (existingMembership) {
    redirect({ href: `/klubber/${group!.id}`, locale });
  }

  // INSERT via request-scoped client so RLS self-insert policy applies.
  const { error: insertError } = await supabase
    .from('group_join_requests')
    .insert({
      group_id: group!.id,
      user_id: user!.id,
      status: 'pending',
    });

  if (insertError) {
    if (isDuplicateError(insertError)) {
      // Already has a pending (or old) request — show the "already sent" state.
      redirect({ href: `/klubber/bli-med/${shortId}?sent=1`, locale });
    }
    console.error('[requestToJoin] insert failed', insertError);
    redirect({ href: `/klubber/bli-med/${shortId}?error=unknown`, locale });
  }

  // Best-effort notify all owners/admins of the club.
  const { data: adminMembers } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', group!.id)
    .in('role', ['owner', 'admin']);

  if (adminMembers && adminMembers.length > 0) {
    const requesterName = await getRequesterName(user!.id);

    await Promise.allSettled(
      adminMembers.map((m) =>
        notify({
          userId: m.user_id as string,
          kind: 'club_join_request',
          payload: {
            group_id: group!.id,
            group_name: group!.name,
            requester_name: requesterName,
          },
        }).catch((err) => console.error('[requestToJoin] notify failed', err)),
      ),
    );
  }

  redirect({ href: `/klubber/bli-med/${shortId}?sent=1`, locale });
}
