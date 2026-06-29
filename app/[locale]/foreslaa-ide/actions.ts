'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { expectOne } from '@/lib/supabase/affectedRows';
import { sendIdeaSubmittedNotification } from '@/lib/mail/ideaSubmittedNotification';
import { firstName } from '@/lib/firstName';
import type { AppLocale } from '@/i18n/routing';

const MAX_TEXT = 2000;

/**
 * Server action: validates the idea text, inserts a row into idea_submissions,
 * sends a best-effort notification mail to all admins, then redirects to the
 * success state.
 */
export async function submitIdea(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;

  const text = String(formData.get('text') ?? '').trim();

  if (!text || text.length > MAX_TEXT) {
    redirect({ href: '/foreslaa-ide?error=empty', locale });
    return;
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
    return;
  }

  // Insert the idea — RLS enforces user_id = auth.uid() on INSERT. expectOne
  // turns a silent 0-row write into a throw; we don't need the returned id.
  expectOne(
    await supabase
      .from('idea_submissions')
      .insert({ user_id: user.id, text })
      .select('id'),
    'submitIdea',
  );

  // Fetch submitter's name for the admin notification.
  const [submitterRes, adminsRes] = await Promise.all([
    supabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .maybeSingle<{ name: string | null }>(),
    supabase
      .from('users')
      .select('id, email, name, locale')
      .eq('is_admin', true)
      .not('email', 'is', null)
      .returns<{ id: string; email: string; name: string | null; locale: string | null }[]>(),
  ]);

  const submitterName = submitterRes.data?.name?.trim() || '(ukjent spiller)';
  const admins = (adminsRes.data ?? []).filter((a) => a.id !== user.id);

  // Best-effort: notify all admins via Resend. Failure must NOT block the user.
  if (admins.length > 0) {
    const results = await Promise.allSettled(
      admins.map((a) =>
        sendIdeaSubmittedNotification({
          to: a.email,
          adminFirstName: firstName(a.name),
          submitterName,
          text,
          locale: a.locale,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[submitIdea] admin notification mail failed', r.reason);
      }
    }
  }

  redirect({ href: '/foreslaa-ide?sent=1', locale });
}
