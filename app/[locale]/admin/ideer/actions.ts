'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { expectOne } from '@/lib/supabase/affectedRows';
import { notify } from '@/lib/notifications/notify';
import { sendIdeaBuiltNotification } from '@/lib/mail/ideaBuiltNotification';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getAdminClient } from '@/lib/supabase/admin';
import { validateIdeaBuiltInput } from '@/lib/notifications/ideaBuiltInput';

/**
 * Admin action: marks an idea_submissions row as built, fires the in-app
 * notification, and sends a fallback mail when the user is off-app. The admin
 * writes a line about what was built and may add a link (#2568); bad input
 * redirects back with `?error=<code>` and leaves the row alone.
 */
export async function markIdeaBuilt(formData: FormData) {
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const locale = await getLocale();
  const parsed = validateIdeaBuiltInput({
    summary: String(formData.get('summary') ?? ''),
    link: String(formData.get('link') ?? ''),
  });
  if (!parsed.ok) {
    redirect({ href: `/admin/ideer?error=${parsed.error}`, locale });
  }
  const { summary, link } = parsed.value;

  // Update the row: set status + built_at. RLS enforces admin-only UPDATE.
  const row = expectOne(
    await supabase
      .from('idea_submissions')
      .update({
        status: 'bygd',
        built_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('user_id'),
    'markIdeaBuilt',
  ) as { user_id: string };

  const userId = row.user_id;

  // Fire the in-app notification.
  let shouldAlsoSendMail = false;
  try {
    const result = await notify({
      userId,
      kind: 'idea_built',
      payload: { submission_id: id, summary, ...(link ? { link } : {}) },
    });
    shouldAlsoSendMail = result.shouldAlsoSendMail;
  } catch (err) {
    console.error('[markIdeaBuilt] notify failed', err);
    // Notify failure must not block — the DB row is already updated.
  }

  // Mail fallback if the user is off-app.
  if (shouldAlsoSendMail) {
    try {
      const userRes = await getAdminClient()
        .from('users')
        .select('email, name, locale')
        .eq('id', userId)
        .maybeSingle<{ email: string | null; name: string | null; locale: string | null }>();

      const u = userRes.data;
      if (u?.email) {
        const results = await Promise.allSettled([
          sendIdeaBuiltNotification({
            to: u.email,
            name: u.name ?? null,
            locale: u.locale,
            summary,
            link,
          }),
        ]);
        for (const r of results) {
          if (r.status === 'rejected') {
            console.error('[markIdeaBuilt] idea built notification mail failed', r.reason);
          }
        }
      }
    } catch (err) {
      console.error('[markIdeaBuilt] mail lookup failed', err);
    }
  }

  revalidatePath('/admin/ideer');
  // Back to the clean list, so a ?error= banner from an earlier try is gone.
  // Outside every try/catch: redirect() throws NEXT_REDIRECT.
  redirect({ href: '/admin/ideer', locale });
}
