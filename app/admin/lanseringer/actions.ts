'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { publishProductUpdate } from '@/lib/productUpdates/publish';
import { sendDigestForPeriod } from '@/lib/productUpdates/digest';

/**
 * Self-gate + return `{ userId }` for the lanseringer-actions. Wraps the
 * shared `requireAdmin` helper so each action keeps its existing
 * destructure-shape. Prepares for Fase 4 chunk 2 (#223) lifting the
 * admin-layout-gate.
 */
async function loadAdminContext() {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
  return { userId: role.userId };
}

const ERROR_REDIRECT = (code: string) =>
  redirect(`/admin/lanseringer?error=${encodeURIComponent(code)}`);

export async function publishProductUpdateAction(formData: FormData) {
  const { userId } = await loadAdminContext();

  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const linkRaw = String(formData.get('link') ?? '').trim();
  const ctaRaw = String(formData.get('cta_label') ?? '').trim();

  if (!title) ERROR_REDIRECT('title_required');
  if (!body) ERROR_REDIRECT('body_required');

  // Link, if present, must be internal (starts with '/') — same guard
  // the Zod schema enforces for the notification payload.
  if (linkRaw && !linkRaw.startsWith('/')) ERROR_REDIRECT('link_must_be_internal');

  // cta_label only meaningful with a link
  if (ctaRaw && !linkRaw) ERROR_REDIRECT('cta_without_link');

  try {
    const result = await publishProductUpdate({
      title,
      body,
      link: linkRaw || null,
      cta_label: ctaRaw || null,
      createdByUserId: userId,
    });

    revalidatePath('/admin/lanseringer');
    redirect(
      `/admin/lanseringer?published=1&recipients=${result.recipientCount}`,
    );
  } catch (err) {
    // redirect() i Next.js kaster en spesiell error som vi MÅ slippe gjennom.
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    console.error('[publishProductUpdateAction]', err);
    ERROR_REDIRECT('publish_failed');
  }
}

export async function sendDigestNowAction() {
  const { userId } = await loadAdminContext();

  try {
    const result = await sendDigestForPeriod({ sentByUserId: userId });
    revalidatePath('/admin/lanseringer');

    if (result.kind === 'already_sent') {
      redirect(`/admin/lanseringer?digest=already_sent`);
    }
    if (result.kind === 'no_updates') {
      redirect(`/admin/lanseringer?digest=no_updates`);
    }
    redirect(
      `/admin/lanseringer?digest=sent&recipients=${result.recipientCount}&updates=${result.updateCount}`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    console.error('[sendDigestNowAction]', err);
    ERROR_REDIRECT('digest_failed');
  }
}
