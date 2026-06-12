'use server';

const HCP_MIN = -10;
const HCP_MAX = 54;
const GENDERS = ['mens', 'ladies'] as const;
const LEVELS = ['junior', 'normal', 'senior'] as const;
type Gender = (typeof GENDERS)[number];
type Level = (typeof LEVELS)[number];

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import type { AppLocale } from '@/i18n/routing';

export async function updateUser(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const nickname = String(formData.get('nickname') ?? '').trim();
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();
  const emailRaw = String(formData.get('email') ?? '').trim().toLowerCase();
  const genderRaw = String(formData.get('gender') ?? '').trim();
  const levelRaw = String(formData.get('level') ?? 'normal').trim();

  if (!id) redirect({ href: '/admin/spillere?error=unknown', locale });
  if (!name) redirect({ href: `/admin/spillere/${id}?error=name_required`, locale });

  const hcp = Number.parseFloat(hcpRaw.replace(',', '.'));
  if (!Number.isFinite(hcp) || hcp < HCP_MIN || hcp > HCP_MAX) {
    redirect({ href: `/admin/spillere/${id}?error=hcp_out_of_range`, locale });
  }

  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    redirect({ href: `/admin/spillere/${id}?error=email_invalid`, locale });
  }

  if (!GENDERS.includes(genderRaw as Gender)) {
    redirect({ href: `/admin/spillere/${id}?error=gender_required`, locale });
  }
  const gender = genderRaw as Gender;

  if (!LEVELS.includes(levelRaw as Level)) {
    redirect({ href: `/admin/spillere/${id}?error=level_invalid`, locale });
  }
  const level = levelRaw as Level;

  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Replaces the
  // previously-inlined `users.is_admin` check.
  await requireAdmin(supabase);

  // Fetch current email to detect whether it has changed.
  const { data: current } = await supabase
    .from('users')
    .select('email')
    .eq('id', id)
    .single();

  const emailChanged = current && current.email.toLowerCase() !== emailRaw;

  if (emailChanged) {
    // Block if the user is in any active game (same guard used for other
    // destructive flows).
    const { count: activeGameCount } = await supabase
      .from('game_players')
      .select('game_id', { count: 'exact', head: true })
      .eq('user_id', id)
      .in(
        'game_id',
        // Sub-select active games. We use a raw string for the column path
        // because Supabase JS v2 doesn't support subquery filters natively.
        (
          await supabase
            .from('games')
            .select('id')
            .eq('status', 'active')
        ).data?.map((g) => g.id) ?? [],
      );

    if ((activeGameCount ?? 0) > 0) {
      redirect({ href: `/admin/spillere/${id}?error=email_change_blocked_active_game`, locale });
    }

    // Check both public.users and auth.users for conflicts.
    const [{ data: inPublic }, { data: inAuth }] = await Promise.all([
      supabase.rpc('email_is_registered', { p_email: emailRaw }),
      supabase.rpc('email_is_in_auth_users', { email_to_check: emailRaw }),
    ]);

    if (inPublic || inAuth) {
      redirect({ href: `/admin/spillere/${id}?error=email_in_use`, locale });
    }

    // Update auth.users first (service-role). If this fails we abort before
    // touching public.users so the two tables stay consistent.
    const adminClient = getAdminClient();
    const { error: authError } = await adminClient.auth.admin.updateUserById(
      id,
      { email: emailRaw },
    );
    if (authError) {
      console.error('[admin/spillere] auth email update failed', authError);
      redirect({ href: `/admin/spillere/${id}?error=email_update_failed`, locale });
    }
  }

  // Update public.users (email included only when it changed).
  // Bump handicap_updated_at unconditionally — admin saving the form is
  // an endorsement of the current hcp_index, even if the value didn't
  // change. Spares the player a stale-handicap prompt right after admin
  // just fixed it for them.
  const updatePayload: Record<string, unknown> = {
    name,
    nickname: nickname || null,
    hcp_index: hcp,
    handicap_updated_at: new Date().toISOString(),
    gender,
    level,
  };
  if (emailChanged) {
    updatePayload.email = emailRaw;
  }

  const { error } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.error('[admin/spillere] updateUser failed', error);
    redirect({ href: `/admin/spillere/${id}?error=update_failed`, locale });
  }

  redirect({ href: `/admin/spillere/${id}?status=updated`, locale });
}
