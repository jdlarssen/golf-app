'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { recomputeCourseHandicapForUser } from '@/lib/games/recomputeCourseHandicap';
import { toSignedHcp } from '@/lib/handicap/sign';
import { expectOne } from '@/lib/supabase/affectedRows';
import {
  GENDERS,
  HCP_MAX,
  HCP_MIN,
  LEVELS,
  parseHcpMagnitude,
  type Gender,
  type Level,
} from '@/lib/users/profileInput';
import type { TablesUpdate } from '@/lib/database.types';

/**
 * auth.users already carries the new email when the public.users write fails —
 * roll it back so the two tables stay consistent (trap 5; same compensation as
 * claimGuestResult). Best-effort: logged, never thrown.
 */
async function revertAuthEmail(id: string, previousEmail: string) {
  try {
    const { error } = await getAdminClient().auth.admin.updateUserById(id, {
      email: previousEmail,
    });
    if (error) console.error('[admin/spillere] auth email revert failed', error);
  } catch (err) {
    console.error('[admin/spillere] auth email revert threw', err);
  }
}

/**
 * Is the address already in use, in `public.users` or in `auth.users`? The two
 * helpers are server helpers (0252): the service role calls them, behind
 * `requireAdmin` in the action.
 */
async function emailConflict(email: string): Promise<'free' | 'taken' | 'failed'> {
  const serviceClient = getAdminClient();
  const [inPublic, inAuth] = await Promise.all([
    serviceClient.rpc('email_is_registered', { p_email: email }),
    serviceClient.rpc('email_is_in_auth_users', { email_to_check: email }),
  ]);
  if (inPublic.error || inAuth.error) {
    console.error('[admin/spillere] email conflict check failed', inPublic.error ?? inAuth.error);
    return 'failed';
  }
  return inPublic.data || inAuth.data ? 'taken' : 'free';
}

export async function updateUser(formData: FormData) {
  const locale = await getLocale();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const nickname = String(formData.get('nickname') ?? '').trim();
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();
  const emailRaw = String(formData.get('email') ?? '').trim().toLowerCase();
  const genderRaw = String(formData.get('gender') ?? '').trim();
  const levelRaw = String(formData.get('level') ?? 'normal').trim();

  if (!id) redirect({ href: '/admin/spillere?error=unknown', locale });
  if (!name) redirect({ href: `/admin/spillere/${id}?error=name_required`, locale });

  // Samme formatsjekk og grenser som profilen (#2048). Feltet her er SIGNERT
  // (ingen pluss-knapp): «-2» betyr pluss 2, så fortegnet skrelles av før
  // magnituden leses.
  const isPlus = hcpRaw.startsWith('-');
  const magnitude = parseHcpMagnitude(isPlus ? hcpRaw.slice(1) : hcpRaw);
  const hcp = magnitude === null ? NaN : toSignedHcp(magnitude, isPlus);
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

  // Fetch current email to detect whether it has changed. A failed read must
  // not read as «unchanged» and save the rest as if the e-mail went through
  // (audit 2026-11-20).
  const { data: current, error: currentError } = await getAdminClient()
    .from('users')
    .select('email')
    .eq('id', id)
    .maybeSingle<{ email: string }>();
  if (currentError || !current) {
    console.error('[admin/spillere] current email read failed', currentError ?? 'no row');
    redirect({ href: `/admin/spillere/${id}?error=update_failed`, locale });
  }

  const emailChanged = current.email.toLowerCase() !== emailRaw;

  if (emailChanged) {
    // Block if the player is in a round that is scheduled or in progress
    // (same rule for both states). One read joins
    // the player's rows to their games (audit 2026-11-20: the old guard
    // passed every game id in one `.in()` list, left out scheduled rounds and
    // ignored errors). A failed read stops the change.
    const { data: openRounds, error: openRoundsError } = await supabase
      .from('game_players')
      .select('game_id, games!inner(status)')
      .eq('user_id', id)
      .in('games.status', ['scheduled', 'active'])
      .limit(1);
    if (openRoundsError) {
      console.error('[admin/spillere] open-round check failed', openRoundsError);
      redirect({ href: `/admin/spillere/${id}?error=email_update_failed`, locale });
    }
    if ((openRounds ?? []).length > 0) {
      redirect({ href: `/admin/spillere/${id}?error=email_change_blocked_active_game`, locale });
    }

    // Check both public.users and auth.users for conflicts. A failed check
    // stops the change.
    const conflict = await emailConflict(emailRaw);
    if (conflict === 'failed') {
      redirect({ href: `/admin/spillere/${id}?error=email_update_failed`, locale });
    }
    if (conflict === 'taken') {
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
  const updatePayload: TablesUpdate<'users'> = {
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

  // Trap 2 (#2054): a write that matched 0 rows is a failure, not «lagret».
  // Only the write sits in the try — `redirect` throws and must not be caught.
  let updateFailed = false;
  try {
    expectOne(
      await supabase.from('users').update(updatePayload).eq('id', id).select('id'),
      'admin/updateUser',
    );
  } catch (err) {
    console.error('[admin/spillere] updateUser failed', err);
    updateFailed = true;
  }

  if (updateFailed) {
    if (emailChanged && current) await revertAuthEmail(id, current.email);
    redirect({ href: `/admin/spillere/${id}?error=update_failed`, locale });
  }

  // Samme recompute som `completeProfile` (#1176) og `updateProfile`: retter
  // arrangøren handicapet for en spiller som står midt i en runde, må de frosne
  // banehandicapene skrives om — ellers scorer spilleren resten av runden på
  // den gamle verdien. Dette er nettopp flaten en arrangør bruker for å fikse
  // et glemt plusshandicap-fortegn på vegne av spilleren.
  // Best-effort: en feilet recompute må aldri blokkere lagringen.
  try {
    await recomputeCourseHandicapForUser(id, hcp);
  } catch (err) {
    console.error('[admin/spillere] course-handicap recompute threw', err);
  }

  redirect({ href: `/admin/spillere/${id}?status=updated`, locale });
}
