'use server';

import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { expectOne } from '@/lib/supabase/affectedRows';
import { notify } from '@/lib/notifications/notify';
import { sendIdeaBuiltNotification } from '@/lib/mail/ideaBuiltNotification';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';

/**
 * Admin action: marks an idea_submissions row as built, fires the in-app
 * notification, and — if the user is off-app — sends a fallback mail.
 */
export async function markIdeaBuilt(formData: FormData) {
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

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
      payload: { submission_id: id },
    });
    shouldAlsoSendMail = result.shouldAlsoSendMail;
  } catch (err) {
    console.error('[markIdeaBuilt] notify failed', err);
    // Notify failure must not block — the DB row is already updated.
  }

  // Mail fallback if the user is off-app.
  if (shouldAlsoSendMail) {
    try {
      const userRes = await supabase
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
}
