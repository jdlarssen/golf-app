'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { expectOne } from '@/lib/supabase/affectedRows';
import {
  getPrivateUserFields,
  type PrivateUserFields,
} from '@/lib/users/privateUserFields';
import { sendIdeaSubmittedNotification } from '@/lib/mail/ideaSubmittedNotification';
import { firstName } from '@/lib/firstName';
import { courseReportHref } from '@/lib/courses/courseReportHref';

const MAX_TEXT = 2000;

/**
 * Server action: validates the idea text, inserts a row into idea_submissions,
 * sends a best-effort notification mail to all admins, then redirects to the
 * success state.
 */
export async function submitIdea(formData: FormData) {
  const locale = await getLocale();

  const text = String(formData.get('text') ?? '').trim();
  // #2277: from a course page the field starts as «Om banen X: ». Sent
  // untouched, that is an empty idea, and the error keeps ?bane so the field
  // is filled in again.
  const prefill = String(formData.get('prefill') ?? '').trim();
  const courseSlug = String(formData.get('bane') ?? '').trim();

  if (!text || text === prefill || text.length > MAX_TEXT) {
    redirect({
      href: courseSlug
        ? `${courseReportHref(courseSlug)}&error=empty`
        : '/foreslaa-ide?error=empty',
      locale,
    });
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
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
      .select('id, name, locale')
      .eq('is_admin', true)
      .returns<{ id: string; name: string | null; locale: string | null }[]>(),
  ]);

  const submitterName = submitterRes.data?.name?.trim() || '(ukjent spiller)';
  const adminRows = (adminsRes.data ?? []).filter((a) => a.id !== user.id);
  // #2207: users.email is not readable through the user's own session. The
  // row set above stays the one RLS gives the submitter; the addresses for
  // those ids come from the server-side helper and never leave the server.
  // Best-effort like the mail itself: a failed lookup sends no mail.
  const emails = await getPrivateUserFields(adminRows.map((a) => a.id)).catch((err) => {
    console.error('[submitIdea] admin e-post lookup failed', err);
    return new Map<string, PrivateUserFields>();
  });
  const admins = adminRows.flatMap((a) => {
    const email = emails.get(a.id)?.email;
    return email ? [{ ...a, email }] : [];
  });

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
