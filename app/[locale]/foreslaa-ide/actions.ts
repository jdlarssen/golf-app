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
import { createIdeaIssue } from '@/lib/ideas/githubIdeaIssue';
import { mailUrl } from '@/lib/mail/i18n';

const MAX_TEXT = 2000;
// Every idea becomes a public GitHub issue, so the cap per player is low.
const MAX_IDEAS_PER_DAY = 5;

/**
 * Server action: validates the idea text, applies the per-player daily cap,
 * inserts a row into idea_submissions, then publishes the idea as a GitHub issue
 * (no name; see lib/ideas/githubIdeaIssue.ts). Only when that is not done, the
 * admins get the notification mail instead (best-effort). Then redirects to the
 * success state.
 *
 * Course reports («Stemmer ikke noe? Si fra», `bane` set) are a message to the
 * admin, not an idea, so they are never published; they use the mail.
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

  // Daily cap, counted on the player's own rows (RLS lets them read those).
  // It runs before the insert, so a flood never reaches GitHub. If the count
  // fails the idea is still kept, but it is not published.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countError } = await supabase
    .from('idea_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if (countError) console.error('[submitIdea] rate-limit count failed', countError);
  if ((recentCount ?? 0) >= MAX_IDEAS_PER_DAY) {
    redirect({
      href: courseSlug
        ? `${courseReportHref(courseSlug)}&error=rate`
        : '/foreslaa-ide?error=rate',
      locale,
    });
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

  // Publish as a GitHub issue. Best-effort: a failure falls through to the mail.
  if (!courseSlug && !countError) {
    const issue = await createIdeaIssue(text, mailUrl('no', '/admin/ideer'));
    if (issue.ok) redirect({ href: '/foreslaa-ide?sent=1', locale });
  }

  // Fallback (and course reports): fetch submitter's name for the admin notification.
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
